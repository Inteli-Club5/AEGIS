export class PolicyEngineError extends Error {
  status: number;
  code: string;

  constructor(status: number, code: string, message = code) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export function badRequest(code: string, message = code): never {
  throw new PolicyEngineError(400, code, message);
}

export function unauthorized(code: string, message = code): never {
  throw new PolicyEngineError(401, code, message);
}

export function forbidden(code: string, message = code): never {
  throw new PolicyEngineError(403, code, message);
}

export function notFound(code: string, message = code): never {
  throw new PolicyEngineError(404, code, message);
}

export function conflict(code: string, message = code): never {
  throw new PolicyEngineError(409, code, message);
}

