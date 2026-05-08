import { redirect } from "next/navigation";

type TokenPageProps = {
  params: {
    mint: string;
  };
};

export default function LegacyTokenPage({ params }: TokenPageProps) {
  redirect(`/en/token/${params.mint}`);
}
