import { Observable } from "@nativescript/core";
import * as common from "./index";
export declare function session(id: string): Session;
declare class ObservableBase extends Observable {
    protected notifyPropertyChanged(propertyName: string, value: any): void;
}
declare class Session {
    private _id;
    constructor(id: string);
    uploadFile(fileUri: string, options: common.Request): Task;
    multipartUpload(params: Array<any>, options: common.Request): Task;
    get id(): string;
}
declare class Task extends ObservableBase {
    private static taskCount;
    private static cache;
    private _session;
    private _id;
    private _upload;
    private _totalUpload;
    private _status;
    private _description;
    static create(session: Session, file: string, options: common.Request): Task;
    static createMultiPart(session: Session, params: Array<any>, options: common.Request): Task;
    private static initTask;
    static fromId(id: string): Task;
    get upload(): number;
    get totalUpload(): number;
    get status(): string;
    get description(): string;
    get session(): Session;
    setTotalUpload(value: number): void;
    setUpload(value: number): void;
    setStatus(value: string): void;
    setDescription(value: string): void;
    cancel(): void;
}
export {};
