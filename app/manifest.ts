import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "NoteTranslate 课堂笔记",
    short_name: "课堂笔记",
    description: "边听课边记笔记：实时转写与翻译、要点摘要，课后自动总结并生成测验。",
    start_url: "/",
    display: "standalone",
    background_color: "#f5f4ef",
    theme_color: "#3060e0",
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml" }],
  };
}
