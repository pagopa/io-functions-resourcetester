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
import { identity, toString } from "fp-ts/lib/function";
import { BlobService, common } from "azure-storage";
import { fromLeft, fromEither, tryCatch, taskify } from "fp-ts/lib/TaskEither";
import { OptionalParamMiddleware } from "@pagopa/io-functions-commons/dist/src/utils/middlewares/optional_param";
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
  blobId: Option<string>
) => Promise<IResourcesTestResponse>;

const MESSAGE_CONTAINER_NAME = "message-blob";

export const HttpHandler = (): IHttpHandler => async (
  ctx,
  blobService,
  blobId: Option<string>
): Promise<IResourcesTestResponse> =>
  (blobId.isSome()
    ? tryCatch(
        () => getBlobAsText(blobService, MESSAGE_CONTAINER_NAME, blobId.value),
        toError
      )
        .foldTaskEither<Error, Option<string>>(fromLeft, r => fromEither(r))
        .foldTaskEither<Error, string>(fromLeft, r =>
          fromEither(fromOption(new Error("Missing Blob"))(r))
        )
    : taskify<Error, BlobService.ListBlobsResult>(cb =>
        blobService.listBlobsSegmented(
          MESSAGE_CONTAINER_NAME,
          (null as unknown) as common.ContinuationToken,
          cb
        )
      )().map(r => toString(r.entries.length))
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
    OptionalParamMiddleware("blobId", t.string)
  );

  return wrapRequestHandler(middlewaresWrap(handler));
};
