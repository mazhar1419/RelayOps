export function authenticate(req, res, next) {
  const userId = req.session?.userId;

  if (!userId) {
    return res.status(401).json({
      error: {
        code: "UNAUTHENTICATED",
        message: "Please log in",
      },
    });
  }

  req.auth = { userId };
  next();
}