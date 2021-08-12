import * as express from "express";

import { Context } from "@azure/functions";
import { ContextMiddleware } from "@pagopa/io-functions-commons/dist/src/utils/middlewares/context_middleware";
import {
  withRequestMiddlewares,
  wrapRequestHandler
} from "@pagopa/io-functions-commons/dist/src/utils/request_middleware";
import {
  IResponseErrorInternal,
  IResponseSuccessJson,
  ResponseErrorInternal,
  ResponseSuccessJson
} from "@pagopa/ts-commons/lib/responses";
import { right, Either, left, toError } from "fp-ts/lib/Either";
import { identity, toString } from "fp-ts/lib/function";
import { fromEither, fromLeft, tryCatch } from "fp-ts/lib/TaskEither";

import { ServiceResponse, TableService, TableUtilities } from "azure-storage";

import { ITuple2, Tuple2 } from "@pagopa/ts-commons/lib/tuples";

type IResourcesTestResponse =
  | IResponseSuccessJson<{
      readonly message: string;
    }>
  | IResponseErrorInternal;

type IHttpHandler = (
  context: Context,
  insert: ReturnType<typeof insertTableEntity>
) => Promise<IResourcesTestResponse>;

const FEED_CONTENT = "TEST";

const SUBSCRIPTIONS_FEED_TABLE = "subscriptionfeed";

export const insertTableEntity = (
  tableService: TableService,
  table: string
) => <T>(
  entityDescriptor: T
): Promise<
  ITuple2<Either<Error, T | TableService.EntityMetadata>, ServiceResponse>
> =>
  new Promise(resolve =>
    tableService.insertEntity(
      table,
      entityDescriptor,
      (
        error: Error,
        result: T | TableService.EntityMetadata,
        response: ServiceResponse
      ) =>
        resolve(
          response.isSuccessful
            ? Tuple2(right(result), response)
            : Tuple2(left(error), response)
        )
    )
  );

const eg = TableUtilities.entityGenerator;

export const HttpHandler = (): IHttpHandler => async (
  ctx,
  insert
): Promise<IResourcesTestResponse> =>
  tryCatch(
    () =>
      insert({
        PartitionKey: eg.String(FEED_CONTENT),
        RowKey: eg.String(toString(Math.floor(Math.random() * 100000) + 1))
      }),
    toError
  )
    .foldTaskEither(fromLeft, r => fromEither(r.e1))
    .map(r =>
      ResponseSuccessJson({
        headers: ctx.req?.headers,
        message: `OK (response=${JSON.stringify(r)})`
      })
    )
    .mapLeft(ce => ResponseErrorInternal(ce.message))
    .fold<IResourcesTestResponse>(identity, identity)
    .run();

export const HttpCtrl = (
  tableService: TableService
): express.RequestHandler => {
  const handler = HttpHandler();

  const middlewaresWrap = withRequestMiddlewares(ContextMiddleware(), () =>
    Promise.resolve(
      right(insertTableEntity(tableService, SUBSCRIPTIONS_FEED_TABLE))
    )
  );

  return wrapRequestHandler(middlewaresWrap(handler));
};
