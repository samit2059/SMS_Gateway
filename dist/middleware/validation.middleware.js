import { ZodError } from "zod";
export const validate = (schema) => (req, res, next) => {
    try {
        req.body = schema.parse(req.body);
        next();
    }
    catch (error) {
        if (error instanceof ZodError) {
            const errorMessage = error.issues
                .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
                .join(", ");
            return res.status(400).json({
                status: "fail",
                message: errorMessage || "Validation failed",
            });
        }
        next(error);
    }
};
