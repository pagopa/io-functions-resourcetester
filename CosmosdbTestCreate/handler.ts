import * as express from "express";

import { Context } from "@azure/functions";
import { ServiceScopeEnum } from "@pagopa/io-functions-commons/dist/generated/definitions/ServiceScope";

import {
  ServiceModel,
  NewService
} from "@pagopa/io-functions-commons/dist/src/models/service";
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
import { identity, toString } from "fp-ts/lib/function";

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
    .create(
      NewService.decode({
        authorizedCIDRs: new Set([]),
        authorizedRecipients: new Set([]),
        departmentName: "IT",
        isVisible: true,
        maxAllowedPaymentAmount: 0,
        organizationFiscalCode: "01234567890",
        organizationName: "AgID",
        requireSecureChannels: false,
        serviceId: toString(Math.floor(Math.random() * 100000) + 1),
        serviceMetadata: {
          scope: ServiceScopeEnum.NATIONAL,
          tokenName: "TOKEN_NAME"
        },
        serviceName: "Test"
      }).getOrElseL(() => {
        throw new Error("WORNG service create test input");
      })
    )
    .map(s =>
      ResponseSuccessJson({
        headers: ctx.req?.headers,
        message: `OK (serviceId=${s.serviceId})`
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
