exports.errorHandler = (err, req, res, next) => {
  console.error("Error details:", err);

  if (typeof err === "string") {
    return res.status(400).json({ error: err });
  }

  if (err?.response?.data) {
    // Axios error with response data from 3Commas API
    return res
      .status(err.response.status || 500)
      .json({ error: err.response.data });
  }

  if (err?.message) {
    return res.status(500).json({ error: err.message });
  }

  res.status(500).json({ error: "Internal Server Error" });
};
