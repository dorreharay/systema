/**
 * An answer from the backend that is not a success: `{ error, code?, fields?, data? }`. Status 0 and code
 * `network` mean the server could not be reached at all. `data` is what more the server said: the client who already
 * has the phone number (`phone_taken`).
 *
 * It lives apart from `api.ts` (which needs React Native) so that the offline layer, and the tests that run it in plain
 * Node, can throw and recognise the very same error.
 */

/**
 * What more the server says with an error: the client who has the phone number (`phone_taken`); how the month's limit stands
 * (`order_limit_reached`); how many guesses a confirmation code still takes (`invalid_code`); how long to wait for the next code (`code_cooldown`).
 */
export type ErrorData = {
  client?: { id: string; name: string };
  limit?: number;
  used?: number;
  // The first day of the next month (`YYYY-MM-DD`), when the count begins again.
  resets_on?: string;
  attempts_left?: number;
  // Seconds.
  retry_after?: number;
};

export class ApiError extends Error {
  status: number;
  code?: string;
  fields?: Record<string, string>;
  data?: ErrorData;

  constructor(
    status: number,
    message: string,
    code?: string,
    fields?: Record<string, string>,
    data?: ErrorData
  ) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.fields = fields;
    this.data = data;
  }
}
