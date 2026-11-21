import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Model Lab" },
      { name: "description", content: "Private quantitative trading research platform." },
      { property: "og:title", content: "Model Lab" },
      { property: "og:description", content: "Private quantitative trading research platform." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  beforeLoad: () => {
    throw redirect({ to: "/dashboard" });
  },
});
