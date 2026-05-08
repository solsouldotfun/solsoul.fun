import { redirect } from "next/navigation";
import { routing } from "@/i18n/routing";

type LegacyTokenGalleryPageProps = {
  params: {
    mint: string;
  };
};

export default function LegacyTokenGalleryPage({ params }: LegacyTokenGalleryPageProps) {
  redirect(`/${routing.defaultLocale}/token/${params.mint}/gallery`);
}
