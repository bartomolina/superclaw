export class ApiError extends Error {
  status: number;

  constructor(message: string, status = 500) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

export function toApiError(error: unknown): ApiError {
  if (error instanceof ApiError) return error;
  if (error instanceof Error) return new ApiError(error.message, 500);
  return new ApiError("unknown error", 500);
}
