import { Athena } from 'aws-sdk'
import * as csv from 'csv-parser'
import { Transform } from 'stream'
import { setTimeout } from 'timers'
import { AthenaRequest, AthenaRequestConfig } from './request'
import * as util from './util'

export interface AthenaExecutionResult<T> {
  records: T[]
  queryExecution: Athena.QueryExecution
}

export interface AthenaExecutionSelect<T> {
  toPromise: () => Promise<AthenaExecutionResult<T>>
  toStream: () => Transform
}

export interface AthenaClientConfig extends AthenaRequestConfig {
  pollingInterval?: number
  queryTimeout?: number
  concurrentExecMax?: number
  execRightCheckInterval?: number
  skipFetchResult?: boolean
}

const defaultPollingInterval = 1000
const defaultQueryTimeout = 0
const defaultExecRightCheckInterval = 100

let concurrentExecMax = 5
let concurrentExecNum = 0

export function setConcurrentExecMax(val: number) {
  concurrentExecMax = val
}

export class AthenaClient {
  private config: AthenaClientConfig
  private concurrentExecNum: number
  private request: AthenaRequest
  constructor(request: AthenaRequest, config: AthenaClientConfig) {
    this.request = request
    this.config = config
    if (config.concurrentExecMax) {
      console.warn(
        `[WARN] please use 'athena.setConcurrentExecMax()' instead 'clientConfig.concurrentExecMax'`,
      )
      concurrentExecMax = config.concurrentExecMax
    }
    if (
      (config.encryptionOption === 'SSE_KMS' ||
        config.encryptionOption === 'CSE_KMS') &&
      config.encryptionKmsKey === undefined
    ) {
      throw new Error('KMS key required')
    }
  }

  public execute<T>(
    query: string,
    maxResult: number,
    nextToken: string | undefined,
  ) {
    // Execute
    const currentConfig = { ...this.config }
    const csvTransform = new csv()
    this._execute(query, maxResult, nextToken, csvTransform, currentConfig)

    return {
      // Promise
      toPromise: () => {
        return new Promise<any>((resolve, reject) => {
          const records: T[] = []
          let resultSet: Athena.ResultSet

          // Add event listener for promise
          csvTransform.on('data', (record: T) => {
            records.push(record)
          })
          csvTransform.on('query_end', (q: Athena.ResultSet) => {
            resultSet = q
          })
          csvTransform.on('end', (record: T) => {
            return resolve(resultSet)
          })
          csvTransform.on('error', (err: Error) => {
            return reject(err)
          })
        })
      },
      // Stream
      toStream: (): Transform => {
        return csvTransform
      },
    }
  }

  private async _execute(
    query: string,
    maxResult: number,
    nextToken: string | undefined,
    csvTransform: Transform,
    config: AthenaClientConfig,
  ) {
    // Limit the number of concurrent executions
    while (!this.canStartQuery()) {
      await util.sleep(
        config.execRightCheckInterval || defaultExecRightCheckInterval,
      )
    }

    let resultSet: Athena.ResultSet

    // Athena
    try {
      // Execute query
      this.startQuery()
      const queryId = await this.request.startQuery(query, config)

      // Set timeout
      let isTimeout = false
      if ((config.queryTimeout || defaultQueryTimeout) !== 0) {
        setTimeout(() => {
          isTimeout = true
        }, config.queryTimeout || defaultQueryTimeout)
      }

      // Wait for timeout or query success
      while (!isTimeout && !(await this.request.checkQuery(queryId, config))) {
        await util.sleep(config.pollingInterval || defaultPollingInterval)
      }

      // Check timeout
      if (isTimeout) {
        await this.request.stopQuery(queryId, config)
        throw new Error('query timeout')
      }

      // Emit query_end event
      resultSet = await this.request.getQueryResults(
        queryId,
        maxResult,
        nextToken,
      )
      csvTransform.emit('query_end', resultSet)

      this.endQuery()
    } catch (err) {
      this.endQuery()
      csvTransform.emit('error', err)
      return
    }

    csvTransform.end()
    return
  }

  private canStartQuery() {
    return concurrentExecNum < concurrentExecMax
  }

  private startQuery() {
    concurrentExecNum = Math.min(++concurrentExecNum, concurrentExecMax)
  }

  private endQuery() {
    concurrentExecNum = Math.max(--concurrentExecNum, 0)
  }
}
