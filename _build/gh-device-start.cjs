// GitHub 设备码登录（device flow）第一步：拿到 user_code + verification_uri。
// client_id 用 GitHub CLI 的公开 OAuth App id，scope=repo 才能推代码 / 发 Release。
const CLIENT_ID = "178c6fc778ccc68e1d6a";

async function post(pathName, form) {
  const res = await fetch(`https://github.com${pathName}`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent": "huihua-release",
    },
    body: new URLSearchParams(form).toString(),
  });
  return { status: res.status, body: await res.json().catch(() => null) };
}

(async () => {
  const { status, body } = await post("/login/device/code", {
    client_id: CLIENT_ID,
    scope: "repo",
  });
  console.log(status, JSON.stringify(body));
})();
