export type ZeroGRouterErrorCode =
  | "TEEML_CONFIG_ERROR"
  | "TEEML_NOT_PRIVATE"
  | "TEEML_NOT_VERIFIED"
  | "TEEML_OUTPUT_INVALID"
  | "TEEML_PROVIDER_ERROR"
  | "TEEML_TIMEOUT"
  | "TEEML_UNKNOWN_RESULT";

export type ZeroGRouterFailureStage = "BEFORE_SEND" | "PROVIDER_RESPONSE" | "UNKNOWN_RESULT";

export type ZeroGRouterFailureReason =
  | "CATALOG_INVALID"
  | "CATALOG_UNAVAILABLE"
  | "CONFIG_INVALID"
  | "PROVIDER_HTTP_ERROR"
  | "PROVIDER_MISMATCH"
  | "PROVIDER_NOT_PRIVATE"
  | "PROVIDER_SECURITY_PROFILE_MISMATCH"
  | "PROVIDER_NOT_TEE_VERIFIED"
  | "REQUEST_OUTCOME_UNKNOWN"
  | "REQUEST_TIMEOUT"
  | "RESPONSE_ENVELOPE_INVALID"
  | "RESPONSE_MODEL_MISMATCH";

type ZeroGRouterErrorOptions = {
  code: ZeroGRouterErrorCode;
  stage: ZeroGRouterFailureStage;
  reason: ZeroGRouterFailureReason;
  httpStatus?: number;
};

/**
 * Carries only stable, non-sensitive metadata. The upstream error, prompt,
 * response body, and API key are deliberately never attached as a cause.
 */
export class ZeroGRouterError extends Error {
  readonly code: ZeroGRouterErrorCode;
  readonly stage: ZeroGRouterFailureStage;
  readonly reason: ZeroGRouterFailureReason;
  readonly httpStatus?: number;

  constructor(options: ZeroGRouterErrorOptions) {
    super(options.code);
    this.name = "ZeroGRouterError";
    this.code = options.code;
    this.stage = options.stage;
    this.reason = options.reason;
    this.httpStatus = options.httpStatus;
  }
}
