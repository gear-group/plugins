import { Observable, Application, knownFolders } from "@nativescript/core";
/* A snapshot-friendly, lazy-loaded class for ProgressReceiver BEGIN */
let ProgressReceiver;
function onProgressReceiverProgress(context, uploadInfo) {
    const uploadId = uploadInfo.getUploadId();
    const task = Task.fromId(uploadId);
    const totalBytes = uploadInfo.getTotalBytes();
    const currentBytes = uploadInfo.getUploadedBytes();
    task.setTotalUpload(totalBytes);
    task.setUpload(currentBytes);
    task.setStatus("uploading");
    task.notify({
        eventName: "progress",
        object: task,
        currentBytes: currentBytes,
        totalBytes: totalBytes
    });
}
function onProgressReceiverCancelled(context, uploadInfo) {
    const uploadId = uploadInfo.getUploadId();
    const task = Task.fromId(uploadId);
    task.setStatus("cancelled");
    task.notify({ eventName: "cancelled", object: task });
}
function onProgressReceiverError(context, uploadInfo, response, error) {
    const uploadId = uploadInfo.getUploadId();
    const task = Task.fromId(uploadId);
    task.setStatus("error");
    task.notify({
        eventName: "error",
        object: task,
        error,
        responseCode: response && typeof response.getHttpCode === 'function' ? response.getHttpCode() : -1,
        response
    });
}
function onProgressReceiverCompleted(context, uploadInfo, response) {
    const uploadId = uploadInfo.getUploadId();
    const task = Task.fromId(uploadId);
    let totalUpload = uploadInfo.getTotalBytes();
    if (!totalUpload || !isFinite(totalUpload) || totalUpload <= 0) {
        totalUpload = 1;
    }
    task.setUpload(totalUpload);
    task.setTotalUpload(totalUpload);
    task.setStatus("complete");
    task.notify({
        eventName: "progress",
        object: task,
        currentBytes: totalUpload,
        totalBytes: totalUpload
    });
    task.notify({
        eventName: "responded",
        object: task,
        data: response.getBodyAsString(),
        responseCode: response && typeof response.getHttpCode === 'function' ? response.getHttpCode() : -1
    });
    task.notify({
        eventName: "complete",
        object: task,
        responseCode: response && typeof response.getHttpCode === 'function' ? response.getHttpCode() : -1,
        response
    });
}
function initializeProgressReceiver() {
    if (ProgressReceiver) {
        return;
    }
    const zonedOnProgress = global.zonedCallback(onProgressReceiverProgress);
    const zonedOnCancelled = global.zonedCallback(onProgressReceiverCancelled);
    const zonedOnError = global.zonedCallback(onProgressReceiverError);
    const zonedOnCompleted = global.zonedCallback(onProgressReceiverCompleted);
    const temp = {
        onProgress(context, uploadInfo) {
            zonedOnProgress(context, uploadInfo);
        },
        onCancelled(context, uploadInfo) {
            zonedOnCancelled(context, uploadInfo);
        },
        onError(context, uploadInfo, response, error) {
            zonedOnError(context, uploadInfo, response, error);
        },
        onCompleted(context, uploadInfo, serverResponse) {
            zonedOnCompleted(context, uploadInfo, serverResponse);
        }
    };
    const ProgressReceiverImpl = net.gotev.uploadservice.UploadServiceBroadcastReceiver.extend(temp);
    ProgressReceiver = ProgressReceiverImpl;
}
/* ProgressReceiver END */
let hasNamespace = false;
function ensureUploadServiceNamespace() {
    if (!hasNamespace) {
        net.gotev.uploadservice.UploadService.NAMESPACE = Application.android.packageName;
        hasNamespace = true;
    }
}
let receiver;
function ensureReceiver() {
    if (!receiver) {
        const context = Application.android.context;
        initializeProgressReceiver();
        receiver = new ProgressReceiver();
        receiver.register(context);
    }
}
export function session(id) {
    // TODO: Cache.
    return new Session(id);
}
class ObservableBase extends Observable {
    notifyPropertyChanged(propertyName, value) {
        this.notify({ object: this, eventName: Observable.propertyChangeEvent, propertyName: propertyName, value: value });
    }
}
class Session {
    constructor(id) {
        this._id = id;
    }
    uploadFile(fileUri, options) {
        return Task.create(this, fileUri, options);
    }
    multipartUpload(params, options) {
        return Task.createMultiPart(this, params, options);
    }
    get id() {
        return this._id;
    }
}
class Task extends ObservableBase {
    static create(session, file, options) {
        ensureUploadServiceNamespace();
        ensureReceiver();
        const taskId = session.id + "{" + ++Task.taskCount + "}";
        const request = getBinaryRequest(taskId, options, file);
        const task = Task.initTask(taskId, session, options);
        request.startUpload();
        Task.cache[task._id] = task;
        return task;
    }
    static createMultiPart(session, params, options) {
        ensureUploadServiceNamespace();
        ensureReceiver();
        const taskId = session.id + "{" + ++Task.taskCount + "}";
        const request = getMultipartRequest(taskId, options, params);
        const task = Task.initTask(taskId, session, options);
        request.startUpload();
        Task.cache[task._id] = task;
        return task;
    }
    static initTask(taskId, session, options) {
        const task = new Task();
        task._session = session;
        task._id = taskId;
        task.setDescription(options.description);
        task.setUpload(0);
        task.setTotalUpload(1);
        task.setStatus("pending");
        return task;
    }
    static fromId(id) {
        return Task.cache[id];
    }
    get upload() {
        return this._upload;
    }
    get totalUpload() {
        return this._totalUpload;
    }
    get status() {
        return this._status;
    }
    get description() {
        return this._description;
    }
    get session() {
        return this._session;
    }
    setTotalUpload(value) {
        this._totalUpload = value;
        this.notifyPropertyChanged("totalUpload", value);
    }
    setUpload(value) {
        this._upload = value;
        this.notifyPropertyChanged("upload", value);
    }
    setStatus(value) {
        this._status = value;
        this.notifyPropertyChanged("status", value);
    }
    setDescription(value) {
        this._description = value;
        this.notifyPropertyChanged("description", value);
    }
    cancel() {
        net.gotev.uploadservice.UploadService.stopUpload(this._id);
    }
}
Task.taskCount = 0;
Task.cache = {};
function getBinaryRequest(taskId, options, file) {
    const request = new net.gotev.uploadservice.BinaryUploadRequest(Application.android.context, taskId, options.url);
    request.setFileToUpload(file);
    setRequestOptions(request, options);
    return request;
}
function getMultipartRequest(taskId, options, params) {
    const request = new net.gotev.uploadservice.MultipartUploadRequest(Application.android.context, taskId, options.url);
    for (let i = 0; i < params.length; i++) {
        const curParam = params[i];
        if (typeof curParam.name === 'undefined') {
            throw new Error("You must have a `name` value");
        }
        if (typeof curParam.filename === 'undefined') {
            request.addParameter(curParam.name.toString(), curParam.value.toString());
            continue;
        }
        let fileName = curParam.filename;
        if (fileName.startsWith("~/")) {
            fileName = fileName.replace("~/", knownFolders.currentApp().path + "/");
        }
        const destFileName = curParam.destFilename || fileName.substring(fileName.lastIndexOf('/') + 1, fileName.length);
        request.addFileToUpload(fileName, curParam.name, destFileName, curParam.mimeType);
    }
    const utf8 = options.utf8;
    if (utf8) {
        request.setUtf8Charset();
    }
    setRequestOptions(request, options);
    return request;
}
function setRequestOptions(request, options) {
    const displayNotificationProgress = typeof options.androidDisplayNotificationProgress === "boolean" ? options.androidDisplayNotificationProgress : true;
    if (displayNotificationProgress) {
        const uploadNotificationConfig = new net.gotev.uploadservice.UploadNotificationConfig();
        const notificationTitle = typeof options.androidNotificationTitle === "string" ? options.androidNotificationTitle : 'File Upload';
        uploadNotificationConfig.setTitleForAllStatuses(notificationTitle);
        if (typeof options.androidRingToneEnabled === "boolean") {
            uploadNotificationConfig.setRingToneEnabled(new java.lang.Boolean(options.androidRingToneEnabled));
        }
        if (typeof options.androidAutoClearNotification === "boolean") {
            uploadNotificationConfig.getCompleted().autoClear = options.androidAutoClearNotification;
            uploadNotificationConfig.getCancelled().autoClear = options.androidAutoClearNotification;
            uploadNotificationConfig.getError().autoClear = options.androidAutoClearNotification;
        }
        if (typeof options.androidNotificationChannelID === "string" && options.androidNotificationChannelID) {
            uploadNotificationConfig.setNotificationChannelId(options.androidNotificationChannelID);
        }
        request.setNotificationConfig(uploadNotificationConfig);
    }
    const autoDeleteAfterUpload = typeof options.androidAutoDeleteAfterUpload === "boolean" ? options.androidAutoDeleteAfterUpload : false;
    if (autoDeleteAfterUpload) {
        request.setAutoDeleteFilesAfterSuccessfulUpload(true);
    }
    const maxRetryCount = typeof options.androidMaxRetries === "number" ? options.androidMaxRetries : undefined;
    if (maxRetryCount) {
        request.setMaxRetries(maxRetryCount);
    }
    const headers = options.headers;
    if (headers) {
        for (const header in headers) {
            const value = headers[header];
            if (value !== null && value !== void 0) {
                request.addHeader(header, value.toString());
            }
        }
    }
    request.setMethod(options.method ? options.method : "GET");
}
//# sourceMappingURL=index.android.js.map