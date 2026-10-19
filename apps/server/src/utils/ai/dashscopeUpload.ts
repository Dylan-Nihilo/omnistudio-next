import { randomUUID } from "node:crypto";

// ACT: 百炼临时文件保留 48 小时；大视频走官方上传策略，突破请求体 10 MB 限制并支持至 1 GB。
export async function uploadDashscopeVideo(apiKey: string, bytes: Uint8Array, mimeType: string, filename: string, signal?: AbortSignal) {
  const policyResponse = await fetch("https://dashscope.aliyuncs.com/api/v1/uploads?action=getPolicy&model=qwen3.7-plus", {
    headers: { Authorization: `Bearer ${apiKey}` },
    signal,
  });
  if (!policyResponse.ok) throw new Error(`获取百炼临时上传策略失败（HTTP ${policyResponse.status}）`);
  const responseData = await policyResponse.json() as { data?: Record<string, string> };
  const data = responseData.data ?? {};
  if (!data.upload_host || !data.upload_dir || !data.oss_access_key_id || !data.policy || !data.signature) {
    throw new Error("百炼临时上传策略返回格式异常");
  }
  const extension = filename.split(".").pop() ?? mimeType.split("/")[1] ?? "mp4";
  const key = `${data.upload_dir.replace(/\/$/, "")}/video-${randomUUID()}.${extension}`;
  const form = new FormData();
  form.append("OSSAccessKeyId", data.oss_access_key_id);
  form.append("policy", data.policy);
  form.append("Signature", data.signature);
  form.append("key", key);
  form.append("x-oss-object-acl", "private");
  form.append("x-oss-forbid-overwrite", "true");
  form.append("success_action_status", "200");
  form.append("file", new Blob([Buffer.from(bytes)], { type: mimeType }), key.split("/").pop()!);
  const uploadResponse = await fetch(data.upload_host, { method: "POST", body: form, signal });
  if (!uploadResponse.ok) {
    const detail = (await uploadResponse.text().catch(() => "")).trim().slice(0, 300);
    throw new Error(`上传视频到百炼临时存储失败（HTTP ${uploadResponse.status}）${detail ? `：${detail}` : ""}`);
  }
  return `oss://${key}`;
}
