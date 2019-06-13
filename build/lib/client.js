"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : new P(function (resolve) { resolve(result.value); }).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
const csv = require("csv-parser");
const timers_1 = require("timers");
const util = require("./util");
const defaultPollingInterval = 1000;
const defaultQueryTimeout = 0;
const defaultExecRightCheckInterval = 100;
let concurrentExecMax = 5;
let concurrentExecNum = 0;
function setConcurrentExecMax(val) {
    concurrentExecMax = val;
}
exports.setConcurrentExecMax = setConcurrentExecMax;
class AthenaClient {
    constructor(request, config) {
        this.request = request;
        this.config = config;
        if (config.concurrentExecMax) {
            console.warn(`[WARN] please use 'athena.setConcurrentExecMax()' instead 'clientConfig.concurrentExecMax'`);
            concurrentExecMax = config.concurrentExecMax;
        }
        if ((config.encryptionOption === 'SSE_KMS' ||
            config.encryptionOption === 'CSE_KMS') &&
            config.encryptionKmsKey === undefined) {
            throw new Error('KMS key required');
        }
    }
    execute(query, maxResult, nextToken) {
        const currentConfig = Object.assign({}, this.config);
        const csvTransform = new csv();
        this._execute(query, maxResult, nextToken, csvTransform, currentConfig);
        return {
            toPromise: () => {
                return new Promise((resolve, reject) => {
                    const records = [];
                    let resultSet;
                    csvTransform.on('data', (record) => {
                        records.push(record);
                    });
                    csvTransform.on('query_end', (q) => {
                        resultSet = q;
                    });
                    csvTransform.on('end', (record) => {
                        return resolve(resultSet);
                    });
                    csvTransform.on('error', (err) => {
                        return reject(err);
                    });
                });
            },
            toStream: () => {
                return csvTransform;
            },
        };
    }
    _execute(query, maxResult, nextToken, csvTransform, config) {
        return __awaiter(this, void 0, void 0, function* () {
            while (!this.canStartQuery()) {
                yield util.sleep(config.execRightCheckInterval || defaultExecRightCheckInterval);
            }
            let resultSet;
            try {
                this.startQuery();
                const queryId = yield this.request.startQuery(query, config);
                let isTimeout = false;
                if ((config.queryTimeout || defaultQueryTimeout) !== 0) {
                    timers_1.setTimeout(() => {
                        isTimeout = true;
                    }, config.queryTimeout || defaultQueryTimeout);
                }
                while (!isTimeout && !(yield this.request.checkQuery(queryId, config))) {
                    yield util.sleep(config.pollingInterval || defaultPollingInterval);
                }
                if (isTimeout) {
                    yield this.request.stopQuery(queryId, config);
                    throw new Error('query timeout');
                }
                resultSet = yield this.request.getQueryResults(queryId, maxResult, nextToken);
                csvTransform.emit('query_end', resultSet);
                this.endQuery();
            }
            catch (err) {
                this.endQuery();
                csvTransform.emit('error', err);
                return;
            }
            csvTransform.end();
            return;
        });
    }
    canStartQuery() {
        return concurrentExecNum < concurrentExecMax;
    }
    startQuery() {
        concurrentExecNum = Math.min(++concurrentExecNum, concurrentExecMax);
    }
    endQuery() {
        concurrentExecNum = Math.max(--concurrentExecNum, 0);
    }
}
exports.AthenaClient = AthenaClient;
//# sourceMappingURL=client.js.map