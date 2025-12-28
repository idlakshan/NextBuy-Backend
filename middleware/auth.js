import jwt from "jsonwebtoken";

const auth =async (req, res, next) => {
  const header = req.headers.authorization;
  if (!header) {
    //console.log("No access token");
    return res.sendStatus(401);
  }
  const token = header.split(" ")[1];

  jwt.verify(token, process.env.SECRET_KEY_ACCESS_TOKEN, (err, decoded) => {
    if (err) {
     // console.log("ACCESS TOKEN EXPIRED");
      return res.sendStatus(403);
    }
    //console.log("ACCESS TOKEN VALID");
    req.userId = decoded.id;
    next();
  });
};

export default auth;
