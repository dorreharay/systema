/**
 * An answer from the backend that is not a success: `{ error, code?, fields?, data? }`. Status 0 and code
 * `network` mean the server could not be reached at all. `data` is what more the server said: the client who already
 * has the phone number (`phone_taken`).
 *
 * It lives apart from `api.ts` (which needs React Native) so that the offline layer, and the tests that run it in plain
 * Node, can throw and recognise the very same error.
 */
export class ApiError extends Error {
  status: number;
  code?: string;
  fields?: Record<string, string>;
  data?: { client?: { id: string; name: string } };

  constructor(
    status: number,
    message: string,
    code?: string,
    fields?: Record<string, string>,
    data?: ApiError['data']
  ) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.fields = fields;
    this.data = data;
  }
}
