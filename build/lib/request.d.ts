import { Readable } from 'stream';
export interface AthenaRequestConfig {
    bucketUri: string;
    baseRetryWait?: number;
    retryWaitMax?: number;
    retryCountMax?: number;
    database?: string;
    encryptionOption?: string;
    encryptionKmsKey?: string;
    workGroup?: string;
}
export declare class AthenaRequest {
    private athena;
    private s3;
    constructor(athena: any, s3: any);
    startQuery(query: string, config: AthenaRequestConfig): Promise<string>;
    checkQuery(queryId: string, config: AthenaRequestConfig): Promise<boolean>;
    stopQuery(queryId: string, config: AthenaRequestConfig): Promise<void>;
    getQueryExecution(queryId: string, config: AthenaRequestConfig): Promise<any>;
    getResultsStream(s3Uri: string): Readable;
    getQueryResults(QueryExecutionId: string | undefined, MaxResults: number, NextToken: string | undefined): Promise<any>;
}
