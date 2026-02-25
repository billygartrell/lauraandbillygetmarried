import fs from "node:fs";

const POSTS_FILE = "updates/posts.json";
const UPDATES_HTML_FILE = "updates.html";

const issueNumber = process.env.ISSUE_NUMBER;
const issueBody = process.env.ISSUE_BODY || "";
const issueCreatedAt = process.env.ISSUE_CREATED_AT || new Date().toISOString();

if (!issueNumber) {
  throw new Error("ISSUE_NUMBER is required");
}

const getField = (body, label) => {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`^###\\s+${escaped}\\s*\\n([\\s\\S]*?)(?=^###\\s+|$)`, "m");
  const match = body.match(re);
  if (!match) return "";

  return match[1]
    .trim()
    .replace(/^_No response_$/i, "")
    .trim();
};

const extractUrls = (text) => {
  const urls = [];
  const imageMarkdown = /!\[[^\]]*\]\((https?:\/\/[^)\s]+)\)/g;
  const plainUrls = /(https?:\/\/[^\s)]+\.(?:png|jpe?g|webp|gif|avif))/gi;

  let match;
  while ((match = imageMarkdown.exec(text)) !== null) {
    urls.push(match[1]);
  }

  while ((match = plainUrls.exec(text)) !== null) {
    urls.push(match[1]);
  }

  return [...new Set(urls)];
};

const escapeHtml = (value) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");

const formatDate = (iso) =>
  new Date(iso).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });

const text = getField(issueBody, "Update text");
const photosField = getField(issueBody, "Photo URLs (optional)");
const images = [...new Set([...extractUrls(text), ...extractUrls(photosField)])];

if (!text) {
  throw new Error("Update text was empty. The form field is required.");
}

if (!fs.existsSync(POSTS_FILE)) {
  fs.writeFileSync(POSTS_FILE, "[]\n", "utf8");
}

const posts = JSON.parse(fs.readFileSync(POSTS_FILE, "utf8"));
const normalizedIssueNumber = Number(issueNumber);
const existing = posts.find((post) => post.issueNumber === normalizedIssueNumber);

if (!existing) {
  posts.unshift({
    issueNumber: normalizedIssueNumber,
    createdAt: issueCreatedAt,
    text,
    images,
  });
}

fs.writeFileSync(POSTS_FILE, `${JSON.stringify(posts, null, 2)}\n`, "utf8");

if (!fs.existsSync(UPDATES_HTML_FILE)) {
  throw new Error("updates.html was not found");
}

const html = fs.readFileSync(UPDATES_HTML_FILE, "utf8");
const rendered = posts
  .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
  .map((post) => {
    const safeText = escapeHtml(post.text).replace(/\n/g, "<br>");
    const dateText = formatDate(post.createdAt);
    const imageMarkup = post.images
      .map((url) => `<img src="${escapeHtml(url)}" alt="Update photo" loading="lazy">`)
      .join("\n");

    return `<article class="update-post">\n  <p class="update-date">${dateText}</p>\n  <p class="update-text">${safeText}</p>${imageMarkup ? `\n  <div class="update-gallery">\n${imageMarkup}\n  </div>` : ""}\n</article>`;
  })
  .join("\n\n");

const replaced = html.replace(
  /<!-- POSTS:START -->[\s\S]*<!-- POSTS:END -->/,
  `<!-- POSTS:START -->\n${rendered ? `${rendered}\n` : ""}<!-- POSTS:END -->`
);

if (replaced === html) {
  throw new Error("Could not find POSTS:START/POSTS:END markers in updates.html");
}

fs.writeFileSync(UPDATES_HTML_FILE, replaced, "utf8");
