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
import { right, toError } from "fp-ts/lib/Either";
import { identity } from "fp-ts/lib/function";
import { tryCatch } from "fp-ts/lib/TaskEither";
import { QueueServiceClient } from "@azure/storage-queue";

type IResourcesTestResponse =
  | IResponseSuccessJson<{
      readonly message: string;
    }>
  | IResponseErrorInternal;

type IHttpHandler = (
  context: Context,
  queueService: QueueServiceClient
) => Promise<IResourcesTestResponse>;

const QUEUE_NAME = "message-queue";

export const HttpHandler = (): IHttpHandler => async (
  ctx,
  queueService
): Promise<IResourcesTestResponse> =>
  tryCatch(
    () =>
      queueService
        .getQueueClient(QUEUE_NAME)
        .receiveMessages({ numberOfMessages: 32 }),
    toError
  )
    .chainFirst(
      tryCatch(
        () => queueService.getQueueClient(QUEUE_NAME).clearMessages(),
        toError
      )
    )
    .map(qr =>
      ResponseSuccessJson({
        headers: ctx.req?.headers,
        message: `OK (count=${qr.receivedMessageItems.length})`
      })
    )
    .mapLeft(ce => ResponseErrorInternal(ce.message))
    .fold<IResourcesTestResponse>(identity, identity)
    .run();

export const HttpCtrl = (
  queueService: QueueServiceClient
): express.RequestHandler => {
  const handler = HttpHandler();

  const middlewaresWrap = withRequestMiddlewares(ContextMiddleware(), () =>
    Promise.resolve(right(queueService))
  );

  return wrapRequestHandler(middlewaresWrap(handler));
};
