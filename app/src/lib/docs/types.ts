export type DocPage = {
  slug: string;
  title: string;
  description: string;
  category: "protocol" | "technical" | "reference" | "community";
  content: string;
};

export type DocCategory = {
  key: DocPage["category"];
  label: string;
  labelZh: string;
};
