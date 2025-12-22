import jwt from "jsonwebtoken";

const generatedAccessToken = (userId) => {
  //console.log("Creating ACCESS token (10s)");
  const accessToken = jwt.sign(
    { id: userId },
    process.env.SECRET_KEY_ACCESS_TOKEN,
    { expiresIn: "15m" }
  );
  return accessToken;
};

export default generatedAccessToken;
