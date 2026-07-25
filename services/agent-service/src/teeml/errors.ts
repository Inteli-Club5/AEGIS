import type { TeeMlTechnicalReasonCode } from "./types.js";

const DEFAULT_HTTP_STATUS: Record<TeeMlTechnicalReasonCode, number> = {
  TEEML_CONFIG_ERROR: 503,
  TEEML_PROVIDER_ERROR: 502,
  TEEML_TIMEOUT: 504,
  TEEML_OUTPUT_INVALID: 502,
  TEEML_HASH_MISMATCH: 502,
  TEEML_NOT_PRIVATE: 502,
  TEEML_NOT_VERIFIED: 502,
  TEEML_TRUSTED_CONTEXT_MISSING: 409,
  TEEML_CONFLICT: 409,
  TEEML_UNKNOWN_RESULT: 504,
};

export class TeeMlError extends Error {
  readonly httpStatus: number;

  constructor(
    readonly code: TeeMlTechnicalReasonCode,
    message: string,
    readonly requestDispatched = false,
    httpStatus = DEFAULT_HTTP_STATUS[code],
  ) {
    super(message);
    this.name = "TeeMlError";
    this.httpStatus = httpStatus;
  }
}
