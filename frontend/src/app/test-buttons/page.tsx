import Button from '@/components/Button';

export default function ButtonTestPage() {
  return (
    <div className="p-20 space-y-8 bg-gray-900 min-h-screen text-white">
      <h1 className="text-3xl font-bold border-b border-gray-700 pb-4">Button Variant Gallery</h1>
      
      <div className="flex flex-wrap gap-6 items-center">
        <div className="space-y-2">
          <p className="text-xs text-gray-400 uppercase">Primary (Orange)</p>
          <Button variant="primary">Primary Action</Button>
        </div>
        <div className="space-y-2">
          <p className="text-xs text-gray-400 uppercase">Secondary (Teal)</p>
          <Button variant="secondary">Secondary Action</Button>
        </div>
      </div>

      <div className="space-y-2 pt-8 border-t border-gray-800">
        <p className="text-xs text-gray-400 uppercase">States & Loading</p>
        <div className="flex gap-4">
          <Button variant="primary" isLoading>Saving Changes...</Button>
          <Button variant="secondary" disabled>Locked Button</Button>
        </div>
      </div>
    </div>
  );
}