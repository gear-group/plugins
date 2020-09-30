import { knownFolders, Observable } from '@nativescript/core';
const main_queue = dispatch_get_current_queue();
let zonedOnProgress = null;
let zonedOnError = null;
function onProgress(nsSession, nsTask, sent, expectedTotal) {
    const task = Task.getTask(nsSession, nsTask);
    task.notifyPropertyChange('upload', task.upload);
    task.notifyPropertyChange('totalUpload', task.totalUpload);
    task.notify({
        eventName: 'progress',
        object: task,
        currentBytes: sent,
        totalBytes: expectedTotal,
    });
}
function onError(session, nsTask, error) {
    const task = Task.getTask(session, nsTask);
    if (task._fileToCleanup) {
        NSFileManager.defaultManager.removeItemAtPathError(task._fileToCleanup);
    }
    const response = nsTask && nsTask.performSelector('response');
    if (error) {
        task.notifyPropertyChange('status', task.status);
        task.notify({
            eventName: 'error',
            object: task,
            error,
            responseCode: response ? response.statusCode : -1,
            response,
        });
    }
    else {
        task.notifyPropertyChange('upload', task.upload);
        task.notifyPropertyChange('totalUpload', task.totalUpload);
        task.notify({
            eventName: 'progress',
            object: task,
            currentBytes: nsTask.countOfBytesSent,
            totalBytes: nsTask.countOfBytesExpectedToSend,
        });
        task.notify({
            eventName: 'complete',
            object: task,
            responseCode: response ? response.statusCode : -1,
            response,
        });
        Task._tasks.delete(nsTask);
    }
}
var BackgroundUploadDelegate = /** @class */ (function (_super) {
    __extends(BackgroundUploadDelegate, _super);
    function BackgroundUploadDelegate() {
        return _super !== null && _super.apply(this, arguments) || this;
    }
    // NSURLSessionDelegate
    BackgroundUploadDelegate.prototype.URLSessionDidBecomeInvalidWithError = function (session, error) { };
    BackgroundUploadDelegate.prototype.URLSessionDidReceiveChallengeCompletionHandler = function (session, challenge, comlpetionHandler) {
        var disposition = null;
        var credential = null;
        comlpetionHandler(disposition, credential);
    };
    BackgroundUploadDelegate.prototype.URLSessionDidFinishEventsForBackgroundURLSession = function (session) { };
    // NSURLSessionTaskDelegate
    BackgroundUploadDelegate.prototype.URLSessionTaskDidCompleteWithError = function (session, nsTask, error) {
        dispatch_async(main_queue, function () {
            zonedOnError(session, nsTask, error);
        });
    };
    BackgroundUploadDelegate.prototype.URLSessionTaskDidReceiveChallengeCompletionHandler = function (session, task, challenge, completionHandler) {
        var disposition = null;
        var credential = null;
        completionHandler(disposition, credential);
    };
    BackgroundUploadDelegate.prototype.URLSessionTaskDidSendBodyDataTotalBytesSentTotalBytesExpectedToSend = function (nsSession, nsTask, data, sent, expectedTotal) {
        dispatch_async(main_queue, function () {
            zonedOnProgress(nsSession, nsTask, sent, expectedTotal);
        });
    };
    BackgroundUploadDelegate.prototype.URLSessionTaskNeedNewBodyStream = function (session, task, need) { };
    BackgroundUploadDelegate.prototype.URLSessionTaskWillPerformHTTPRedirectionNewRequestCompletionHandler = function (session, task, redirect, request, completionHandler) {
        completionHandler(request);
    };
    // NSURLSessionDataDelegate
    BackgroundUploadDelegate.prototype.URLSessionDataTaskDidReceiveResponseCompletionHandler = function (session, dataTask, response, completionHandler) {
        var disposition = null;
        completionHandler(disposition);
    };
    BackgroundUploadDelegate.prototype.URLSessionDataTaskDidBecomeDownloadTask = function (session, dataTask, downloadTask) { };
    BackgroundUploadDelegate.prototype.URLSessionDataTaskDidReceiveData = function (session, dataTask, data) {
        dispatch_async(main_queue, function () {
            // we have a response in the data...
            var jsTask = Task.getTask(session, dataTask);
            var jsonString = NSString.alloc().initWithDataEncoding(data, NSUTF8StringEncoding);
            jsTask.notify({
                eventName: 'responded',
                object: jsTask,
                data: jsonString.toString(),
                responseCode: dataTask && dataTask.response ? dataTask.response.statusCode : -1,
            });
        });
    };
    BackgroundUploadDelegate.prototype.URLSessionDataTaskWillCacheResponseCompletionHandler = function () { };
    // NSURLSessionDownloadDelegate
    BackgroundUploadDelegate.prototype.URLSessionDownloadTaskDidResumeAtOffsetExpectedTotalBytes = function (session, task, offset, expects) { };
    BackgroundUploadDelegate.prototype.URLSessionDownloadTaskDidWriteDataTotalBytesWrittenTotalBytesExpectedToWrite = function (session, task, data, written, expected) { };
    BackgroundUploadDelegate.prototype.URLSessionDownloadTaskDidFinishDownloadingToURL = function (session, task, url) { };
    BackgroundUploadDelegate.ObjCProtocols = [NSURLSessionDelegate, NSURLSessionTaskDelegate, NSURLSessionDataDelegate, NSURLSessionDownloadDelegate];
    return BackgroundUploadDelegate;
}(NSObject));
class Session {
    constructor(id) {
        const delegate = BackgroundUploadDelegate.alloc().init();
        const configuration = NSURLSessionConfiguration.backgroundSessionConfigurationWithIdentifier(id);
        this._session = NSURLSession.sessionWithConfigurationDelegateDelegateQueue(configuration, delegate, null);
        zonedOnProgress = global.zonedCallback(onProgress);
        zonedOnError = global.zonedCallback(onError);
    }
    get ios() {
        return this._session;
    }
    uploadFile(fileUri, options) {
        if (!fileUri) {
            throw new Error('File must be provided.');
        }
        const url = NSURL.URLWithString(options.url);
        const request = NSMutableURLRequest.requestWithURL(url);
        const headers = options.headers;
        if (headers) {
            for (let header in headers) {
                const value = headers[header];
                if (value !== null && value !== void 0) {
                    request.setValueForHTTPHeaderField(value.toString(), header);
                }
            }
        }
        if (options.method) {
            request.HTTPMethod = options.method;
        }
        let fileURL;
        if (fileUri.substr(0, 7) === 'file://') {
            // File URI in string format
            fileURL = NSURL.URLWithString(fileUri);
        }
        else if (fileUri.charAt(0) === '/') {
            // Absolute path with leading slash
            fileURL = NSURL.fileURLWithPath(fileUri);
        }
        const newTask = this._session.uploadTaskWithRequestFromFile(request, fileURL);
        newTask.taskDescription = options.description;
        newTask.resume();
        const retTask = Task.getTask(this._session, newTask);
        return retTask;
    }
    multipartUpload(params, options) {
        const MPF = new MultiMultiPartForm();
        for (let i = 0; i < params.length; i++) {
            const curParam = params[i];
            if (typeof curParam.name === 'undefined') {
                throw new Error('You must have a `name` value');
            }
            if (curParam.filename) {
                const destFileName = curParam.destFilename || curParam.filename.substring(curParam.filename.lastIndexOf('/') + 1, curParam.filename.length);
                MPF.appendParam(curParam.name, null, curParam.filename, curParam.mimeType, destFileName);
            }
            else {
                MPF.appendParam(curParam.name, curParam.value);
            }
        }
        const header = MPF.getHeader();
        const uploadFile = MPF.generateFile();
        if (!options.headers) {
            options.headers = {};
        }
        options.headers['Content-Type'] = header['Content-Type'];
        const task = this.uploadFile(uploadFile, options);
        // Tag the file to be deleted and cleanup after upload
        task._fileToCleanup = uploadFile;
        return task;
    }
    static getSession(id) {
        let jsSession = Session._sessions[id];
        if (jsSession) {
            return jsSession;
        }
        jsSession = new Session(id);
        Session._sessions[id] = jsSession;
        return jsSession;
    }
}
// TODO: Create a mechanism to clean sessions from the cache that have all their tasks completed, canceled or errored out.
Session._sessions = {};
class Task extends Observable {
    constructor(nsSession, nsTask) {
        super();
        this._task = nsTask;
        this._session = nsSession;
    }
    get ios() {
        return this._task;
    }
    get description() {
        return this._task.taskDescription;
    }
    get upload() {
        return this._task.countOfBytesSent;
    }
    get totalUpload() {
        return this._task.countOfBytesExpectedToSend;
    }
    get status() {
        if (this._task.error) {
            return 'error';
        }
        // NSURLSessionTaskState : NSInteger, so we should pass number format here
        switch (this._task.state) {
            case 0 /* Running */:
                return 'uploading';
            case 3 /* Completed */:
                return 'complete';
            case 2 /* Canceling */:
                return 'error';
            case 1 /* Suspended */:
                return 'pending';
        }
    }
    static getTask(nsSession, nsTask) {
        let task = Task._tasks.get(nsTask);
        if (task) {
            return task;
        }
        task = new Task(nsSession, nsTask);
        Task._tasks.set(nsTask, task);
        return task;
    }
    cancel() {
        this._task.cancel();
    }
}
Task._tasks = new Map();
Task.is64BitArchitecture = interop.sizeof(interop.types.id) === 8;
Task.NSIntegerType = Task.is64BitArchitecture ? interop.types.int64 : interop.types.int32;
export function session(id) {
    return Session.getSession(id);
}
class MultiMultiPartForm {
    constructor() {
        this.clear();
    }
    clear() {
        this.boundary = '--------------formboundary' + Math.floor(Math.random() * 100000000000);
        this.header = { 'Content-Type': 'multipart/form-data; boundary=' + this.boundary };
        this.fileCount = 0;
        this.fields = [];
    }
    appendParam(name, value, filename, mimeType, destFileName) {
        // If all we are doing is passing a field, we just add it to the fields list
        if (filename == null) {
            this.fields.push({ name: name, value: value });
            return;
        }
        // Load file
        mimeType = mimeType || 'application/data';
        if (filename.startsWith('~/')) {
            filename = filename.replace('~/', knownFolders.currentApp().path + '/');
        }
        const finalName = destFileName || filename.substr(filename.lastIndexOf('/') + 1, filename.length);
        this.fields.push({ name: name, filename: filename, destFilename: finalName, mimeType: mimeType });
    }
    generateFile() {
        const CRLF = '\r\n';
        const fileName = knownFolders.documents().path + '/temp-MPF-' + Math.floor(Math.random() * 100000000000) + '.tmp';
        const combinedData = NSMutableData.alloc().init();
        let results = '';
        let tempString;
        let newData;
        for (let i = 0; i < this.fields.length; i++) {
            results += '--' + this.boundary + CRLF;
            results += 'Content-Disposition: form-data; name="' + this.fields[i].name + '"';
            if (!this.fields[i].filename) {
                results += CRLF + CRLF + this.fields[i].value + CRLF;
            }
            else {
                results += '; filename="' + this.fields[i].destFilename + '"';
                if (this.fields[i].mimeType) {
                    results += CRLF + 'Content-Type: ' + this.fields[i].mimeType;
                }
                results += CRLF + CRLF;
            }
            tempString = NSString.stringWithString(results);
            results = '';
            newData = tempString.dataUsingEncoding(NSUTF8StringEncoding);
            combinedData.appendData(newData);
            if (this.fields[i].filename) {
                const fileData = NSData.alloc().initWithContentsOfFile(this.fields[i].filename);
                combinedData.appendData(fileData);
                results = CRLF;
            }
        }
        // Add final part of it...
        results += '--' + this.boundary + '--' + CRLF;
        tempString = NSString.stringWithString(results);
        newData = tempString.dataUsingEncoding(NSUTF8StringEncoding);
        combinedData.appendData(newData);
        NSFileManager.defaultManager.createFileAtPathContentsAttributes(fileName, combinedData, null);
        return fileName;
    }
    getHeader() {
        return this.header;
    }
}
//# sourceMappingURL=index.ios.js.map