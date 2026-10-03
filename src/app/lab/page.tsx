import Lab from './Lab';

/** Dev-only 3D character lab (renders nothing in production builds). */
export default function LabPage() {
  if (process.env.NODE_ENV === 'production') return null;
  return <Lab />;
}
