import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Card, CardContent } from '../../components/ui/Card';
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from '../../components/ui/Table';
import { Modal } from '../../components/ui/Modal';
import { LoadingSpinner } from '../../components/ui/LoadingSpinner';
import { Plus, Settings, AlertCircle, CheckCircle2 } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';

interface WorkType {
  id: string;
  name: string;
  default_rate: number;
  created_at: string;
}

const workTypeSchema = z.object({
  name: z.string().min(1, 'Work type name is required'),
  default_rate: z.number().positive('Default rate must be greater than 0'),
});

type WorkTypeFormValues = z.infer<typeof workTypeSchema>;

export default function DomesticWorkTypesPage() {
  const [workTypes, setWorkTypes] = useState<WorkType[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm<WorkTypeFormValues>({
    resolver: zodResolver(workTypeSchema),
    defaultValues: { default_rate: 2.50 }
  });

  const fetchData = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('domestic_work_types')
        .select('*')
        .order('name', { ascending: true });

      if (error) throw error;
      setWorkTypes(data || []);
    } catch (err: any) {
      console.error('Error fetching work types:', err);
      setErrorMessage(err.message || 'Failed to load work types.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const openCreateModal = () => {
    reset({ name: '', default_rate: 2.50 });
    setErrorMessage(null);
    setIsModalOpen(true);
  };

  const onSaveWorkType = async (data: WorkTypeFormValues) => {
    setErrorMessage(null);
    try {
      const { error } = await supabase
        .from('domestic_work_types')
        .insert([{ name: data.name, default_rate: data.default_rate }]);

      if (error) throw error;
      setSuccessMessage(`Work operation "${data.name}" added to master catalog.`);
      setIsModalOpen(false);
      await fetchData();
    } catch (err: any) {
      setErrorMessage(err.message || 'Error saving work type.');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white p-6 rounded-xl border border-border shadow-sm">
        <div>
          <h1 className="text-2xl font-bold text-navy flex items-center gap-2">
            <Settings className="text-primary" /> Work Types & Piece-Rate Catalog
          </h1>
          <p className="text-secondary-text text-sm mt-1">
            Master rate list for Singer, Overlock, Patalock, Flatlock, Ironing, and Packing.
          </p>
        </div>
        <Button onClick={openCreateModal} className="flex items-center gap-2">
          <Plus size={16} /> Add Work Operation
        </Button>
      </div>

      {errorMessage && (
        <div className="p-4 bg-red-50 text-error border border-red-200 rounded-lg flex items-center justify-between">
          <div className="flex items-center gap-2"><AlertCircle size={18} /><span>{errorMessage}</span></div>
          <button onClick={() => setErrorMessage(null)} className="text-xs underline font-medium">Dismiss</button>
        </div>
      )}

      {successMessage && (
        <div className="p-4 bg-green-50 text-success border border-green-200 rounded-lg flex items-center justify-between">
          <div className="flex items-center gap-2"><CheckCircle2 size={18} /><span>{successMessage}</span></div>
          <button onClick={() => setSuccessMessage(null)} className="text-xs underline font-medium">Dismiss</button>
        </div>
      )}

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-12 flex flex-col items-center justify-center">
              <LoadingSpinner size={36} />
              <p className="mt-3 text-secondary-text text-sm">Loading rate catalog...</p>
            </div>
          ) : workTypes.length === 0 ? (
            <div className="p-12 text-center text-secondary-text">
              <Settings size={48} className="mx-auto mb-3 opacity-30 text-primary" />
              <p className="font-semibold text-navy">No work operations configured</p>
              <p className="text-sm mt-1">Add job-work types and piece-rate pricing.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Operation / Work Type</TableHead>
                  <TableHead>Default Rate Per Piece</TableHead>
                  <TableHead>Created</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {workTypes.map((wt) => (
                  <TableRow key={wt.id}>
                    <TableCell className="font-bold text-navy">{wt.name}</TableCell>
                    <TableCell className="font-bold text-primary">₹{Number(wt.default_rate).toFixed(2)} / piece</TableCell>
                    <TableCell className="text-xs text-secondary-text">{new Date(wt.created_at).toLocaleDateString()}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title="Add Work Type & Rate"
      >
        <form onSubmit={handleSubmit(onSaveWorkType)} className="space-y-4">
          <Input
            label="Operation Name *"
            placeholder="e.g. Overlock 4-Thread, Flatlock Hemming"
            {...register('name')}
            error={errors.name?.message}
          />

          <Input
            label="Default Rate Per Piece (₹) *"
            type="number"
            step="0.05"
            placeholder="3.50"
            {...register('default_rate', { valueAsNumber: true })}
            error={errors.default_rate?.message}
          />

          <div className="flex justify-end gap-3 pt-4 border-t border-border">
            <Button type="button" variant="outline" onClick={() => setIsModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" isLoading={isSubmitting}>
              Add Operation
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
