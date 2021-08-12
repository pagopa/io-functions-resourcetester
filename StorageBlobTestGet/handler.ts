import * as express from "express";

import { Context } from "@azure/functions";
import { ContextMiddleware } from "@pagopa/io-functions-commons/dist/src/utils/middlewares/context_middleware";
import { getBlobAsText } from "@pagopa/io-functions-commons/dist/src/utils/azure_storage";
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
import { identity } from "fp-ts/lib/function";
import { BlobService } from "azure-storage";
import { fromLeft, fromEither, tryCatch } from "fp-ts/lib/TaskEither";
import { RequiredParamMiddleware } from "@pagopa/io-functions-commons/dist/src/utils/middlewares/required_param";
import * as t from "io-ts";
import { Option } from "fp-ts/lib/Option";

type IResourcesTestResponse =
  | IResponseSuccessJson<{
      readonly message: string;
    }>
  | IResponseErrorInternal;

type IHttpHandler = (
  context: Context,
  blobService: BlobService,
  blobId: string
) => Promise<IResourcesTestResponse>;

const MESSAGE_CONTAINER_NAME = "message-blob";

export const HttpHandler = (): IHttpHandler => async (
  ctx,
  blobService,
  blobId: string
): Promise<IResourcesTestResponse> =>
  tryCatch(
    () => getBlobAsText(blobService, MESSAGE_CONTAINER_NAME, blobId),
    toError
  )
    .foldTaskEither<Error, Option<string>>(fromLeft, r => fromEither(r))
    .foldTaskEither<Error, string>(fromLeft, r =>
      fromEither(fromOption(new Error("Missing Blob"))(r))
    )
    .map(b =>
      ResponseSuccessJson({
        headers: ctx.req?.headers,
        message: `OK (body=${b})`
      })
    )
    .mapLeft(ce => ResponseErrorInternal(ce.message))
    .fold<IResourcesTestResponse>(identity, identity)
    .run();

export const HttpCtrl = (blobService: BlobService): express.RequestHandler => {
  const handler = HttpHandler();

  const middlewaresWrap = withRequestMiddlewares(
    ContextMiddleware(),
    () => Promise.resolve(right(blobService)),
    RequiredParamMiddleware("blobId", t.string)
  );

  return wrapRequestHandler(middlewaresWrap(handler));
};
