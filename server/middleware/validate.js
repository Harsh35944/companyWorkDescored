import { AppError } from "../lib/errors.js";

export function validate({ params, query, body }) {
  return (req, _res, next) => {
    try {
      if (params) req.params = params.parse(req.params);
      if (query) req.query = query.parse(req.query);
      if (body) req.body = body.parse(req.body);
      next();
    } catch (err) {
      next(
        new AppError("Validation failed", {
          statusCode: 400,
          code: "VALIDATION_ERROR",
          details: err?.issues ?? undefined,
        }),
      );
    }
  };
}
