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
import { right } from "fp-ts/lib/Either";
import { identity } from "fp-ts/lib/function";
import { taskify } from "fp-ts/lib/TaskEither";

import { TableQuery, TableService } from "azure-storage";

type IResourcesTestResponse =
  | IResponseSuccessJson<{
      readonly message: string;
    }>
  | IResponseErrorInternal;

type IHttpHandler = (
  context: Context,
  tableService: TableService
) => Promise<IResourcesTestResponse>;

// const FEED_CONTENT = "TEST";

const SUBSCRIPTIONS_FEED_TABLE = "subscriptionfeed";

const query = new TableQuery();

export const HttpHandler = (): IHttpHandler => async (
  ctx,
  tableService
): Promise<IResourcesTestResponse> =>
  taskify<Error, TableService.QueryEntitiesResult<{ readonly RowKey: string }>>(
    cb =>
      tableService.queryEntities(
        SUBSCRIPTIONS_FEED_TABLE,
        query,
        (null as unknown) as TableService.TableContinuationToken,
        cb
      )
  )()
    .map(r =>
      ResponseSuccessJson({
        headers: ctx.req?.headers,
        message: `OK (response=${JSON.stringify(r.entries.length)})`
      })
    )
    .mapLeft(ce => ResponseErrorInternal(JSON.stringify(ce)))
    .fold<IResourcesTestResponse>(identity, identity)
    .run();

export const HttpCtrl = (
  tableService: TableService
): express.RequestHandler => {
  const handler = HttpHandler();

  const middlewaresWrap = withRequestMiddlewares(ContextMiddleware(), () =>
    Promise.resolve(right(tableService))
  );

  return wrapRequestHandler(middlewaresWrap(handler));
};
