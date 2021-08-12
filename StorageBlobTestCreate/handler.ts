import * as express from "express";

import { Context } from "@azure/functions";
import { ContextMiddleware } from "@pagopa/io-functions-commons/dist/src/utils/middlewares/context_middleware";
import { upsertBlobFromText } from "@pagopa/io-functions-commons/dist/src/utils/azure_storage";
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
import { fromOption, right, toError } from "fp-ts/lib/Either";
import { identity, toString } from "fp-ts/lib/function";
import { BlobService } from "azure-storage";
import { fromEither, fromLeft, tryCatch } from "fp-ts/lib/TaskEither";
import { Option } from "fp-ts/lib/Option";

type IResourcesTestResponse =
  | IResponseSuccessJson<{
      readonly message: string;
    }>
  | IResponseErrorInternal;

type IHttpHandler = (
  context: Context,
  blobService: BlobService
) => Promise<IResourcesTestResponse>;

const MESSAGE_CONTAINER_NAME = "message-blob";
const MESSAGE_CONTENT = "TEST";

export const HttpHandler = (): IHttpHandler => async (
  ctx,
  blobService
): Promise<IResourcesTestResponse> =>
  tryCatch(
    () =>
      upsertBlobFromText(
        blobService,
        MESSAGE_CONTAINER_NAME,
        toString(Math.floor(Math.random() * 100000) + 1),
        MESSAGE_CONTENT
      ),
    toError
  )
    .foldTaskEither<Error, Option<BlobService.BlobResult>>(fromLeft, r =>
      fromEither(r)
    )
    .foldTaskEither<Error, BlobService.BlobResult>(
      l => fromLeft(l),
      r => fromEither(fromOption(new Error("Missing Blob create result"))(r))
    )
    .map(br =>
      ResponseSuccessJson({
        headers: ctx.req?.headers,
        message: `OK (blobId=${br.name})`
      })
    )
    .mapLeft(ce => ResponseErrorInternal(JSON.stringify(ce)))
    .fold<IResourcesTestResponse>(identity, identity)
    .run();

export const HttpCtrl = (blobService: BlobService): express.RequestHandler => {
  const handler = HttpHandler();

  const middlewaresWrap = withRequestMiddlewares(ContextMiddleware(), () =>
    Promise.resolve(right(blobService))
  );

  return wrapRequestHandler(middlewaresWrap(handler));
};
