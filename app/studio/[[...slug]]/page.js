import StandaloneShell from '@/components/StandaloneShell';
import YinheVideoStudio from '@/components/YinheVideoStudio';

export const metadata = {
  title: 'Studio — Open Generative AI',
};

export default function StudioPage() {
  const useYinheStudio = Boolean(
    process.env.AIGC_API_BASE_URL
    && process.env.AIGC_API_KEY
    && process.env.AIGC_STUDIO_ACCESS_TOKEN
    && process.env.AIGC_STUDIO_SESSION_SECRET,
  );

  return useYinheStudio ? <YinheVideoStudio /> : <StandaloneShell />;
}
