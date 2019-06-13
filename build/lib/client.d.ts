import { Athena } from 'aws-sdk';
import { Transform } from 'stream';
import { AthenaRequest, AthenaRequestConfig } from './request';
export interface AthenaExecutionResult<T> {
    records: T[];
    queryExecution: Athena.QueryExecution;
}
export interface AthenaExecutionSelect<T> {
    toPromise: () => Promise<AthenaExecutionResult<T>>;
    toStream: () => Transform;
}
export interface AthenaClientConfig extends AthenaRequestConfig {
    pollingInterval?: number;
    queryTimeout?: number;
    concurrentExecMax?: number;
    execRightCheckInterval?: number;
    skipFetchResult?: boolean;
}
export declare function setConcurrentExecMax(val: number): void;
export declare class AthenaClient {
    private config;
    private concurrentExecNum;
    private request;
    constructor(request: AthenaRequest, config: AthenaClientConfig);
    execute<T>(query: string, maxResult: number, nextToken: string | undefined): {
        toPromise: () => Promise<any>;
        toStream: () => Transform;
    };
    private _execute;
    private canStartQuery;
    private startQuery;
    private endQuery;
}
