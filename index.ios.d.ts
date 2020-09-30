import { Observable } from '@nativescript/core';
import { Request as IRequest } from '.';
declare class Session implements Session {
    private static _sessions;
    private _session;
    constructor(id: string);
    get ios(): any;
    uploadFile(fileUri: string, options: IRequest): Task;
    multipartUpload(params: any[], options: any): Task;
    static getSession(id: string): Session;
}
declare class Task extends Observable {
    static _tasks: Map<NSURLSessionTask, Task>;
    private static is64BitArchitecture;
    static NSIntegerType: interop.Type<number>;
    _fileToCleanup: string;
    private _task;
    private _session;
    constructor(nsSession: NSURLSession, nsTask: NSURLSessionTask);
    get ios(): any;
    get description(): string;
    get upload(): number;
    get totalUpload(): number;
    get status(): string;
    static getTask(nsSession: NSURLSession, nsTask: NSURLSessionTask): Task;
    cancel(): void;
}
export declare function session(id: string): Session;
export {};
