import type { Metadata } from 'next';
import { ParentZone } from '@/parent/ParentZone';

export const metadata: Metadata = {
  title: "Parent Zone · Adam's Learning Adventure",
  robots: { index: false, follow: false },
};

export default function ParentPage() {
  return <ParentZone />;
}
