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
import { fromLeft, tryCatch } from "fp-ts/lib/TaskEither";
import { fromNullable } from "fp-ts/lib/Option";
import {
  QueueSendMessageResponse,
  QueueServiceClient
} from "@azure/storage-queue";
import { fromPredicate } from "fp-ts/lib/TaskEither";

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
const MESSAGE_CONTENT = "TEST";

export const HttpHandler = (): IHttpHandler => async (
  ctx,
  queueService
): Promise<IResourcesTestResponse> =>
  tryCatch(
    () =>
      queueService
        .getQueueClient(QUEUE_NAME)
        .sendMessage(
          Buffer.from(JSON.stringify(MESSAGE_CONTENT)).toString("base64")
        ),
    toError
  )
    .foldTaskEither<Error, QueueSendMessageResponse>(
      fromLeft,
      fromPredicate<Error, QueueSendMessageResponse>(
        r => fromNullable(r.errorCode).isNone(),
        r => new Error(`Queue create failed with ${r.errorCode}`)
      )
    )
    .map(qr =>
      ResponseSuccessJson({
        headers: ctx.req?.headers,
        message: `OK (messageId=${qr.messageId})`
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
