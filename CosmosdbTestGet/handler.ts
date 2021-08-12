import * as express from "express";

import { Context } from "@azure/functions";
import { ServiceModel } from "@pagopa/io-functions-commons/dist/src/models/service";
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

type IResourcesTestResponse =
  | IResponseSuccessJson<{
      readonly message: string;
    }>
  | IResponseErrorInternal;

type IHttpHandler = (
  context: Context,
  serviceModel: ServiceModel
) => Promise<IResourcesTestResponse>;

export const HttpHandler = (): IHttpHandler => async (
  ctx,
  serviceModel
): Promise<IResourcesTestResponse> =>
  serviceModel
    .getCollection()
    .map(rs => rs.length)
    .map(rsCount =>
      ResponseSuccessJson({
        headers: ctx.req?.headers,
        message: `OK (count=${rsCount})`
      })
    )
    .mapLeft(ce => ResponseErrorInternal(JSON.stringify(ce)))
    .fold<IResourcesTestResponse>(identity, identity)
    .run();

export const HttpCtrl = (
  serviceModel: ServiceModel
): express.RequestHandler => {
  const handler = HttpHandler();

  const middlewaresWrap = withRequestMiddlewares(ContextMiddleware(), () =>
    Promise.resolve(right(serviceModel))
  );

  return wrapRequestHandler(middlewaresWrap(handler));
};
