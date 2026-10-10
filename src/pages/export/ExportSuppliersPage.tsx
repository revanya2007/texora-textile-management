import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Card, CardHeader, CardContent } from '../../components/ui/Card';
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from '../../components/ui/Table';
import { Modal } from '../../components/ui/Modal';
import { LoadingSpinner } from '../../components/ui/LoadingSpinner';
import { Plus, Search, Truck, Phone, Mail, MapPin, AlertCircle, CheckCircle2 } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';

interface Supplier {
  id: string;
  name: string;
  contact_person?: string;
  phone?: string;
  email?: string;
  address?: string;
  created_at: string;
}

const supplierSchema = z.object({
  name: z.string().min(1, 'Supplier name is required'),
  contact_person: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().email('Invalid email address').optional().or(z.literal('')),
  address: z.string().optional(),
});

type SupplierFormValues = z.infer<typeof supplierSchema>;

export default function ExportSuppliersPage() {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const { register, handleSubmit, reset, setValue, formState: { errors, isSubmitting } } = useForm<SupplierFormValues>({
    resolver: zodResolver(supplierSchema),
  });

  const fetchData = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('export_suppliers')
        .select('*')
        .order('name', { ascending: true });

      if (error) throw error;
      setSuppliers(data || []);
    } catch (err: any) {
      console.error('Error fetching suppliers:', err);
      setErrorMessage(err.message || 'Failed to load suppliers.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const openCreateModal = () => {
    setEditingSupplier(null);
    reset({ name: '', contact_person: '', phone: '', email: '', address: '' });
    setErrorMessage(null);
    setIsModalOpen(true);
  };

  const openEditModal = (supplier: Supplier) => {
    setEditingSupplier(supplier);
    setValue('name', supplier.name);
    setValue('contact_person', supplier.contact_person || '');
    setValue('phone', supplier.phone || '');
    setValue('email', supplier.email || '');
    setValue('address', supplier.address || '');
    setErrorMessage(null);
    setIsModalOpen(true);
  };

  const onSaveSupplier = async (data: SupplierFormValues) => {
    setErrorMessage(null);
    try {
      const payload = {
        name: data.name,
        contact_person: data.contact_person || null,
        phone: data.phone || null,
        email: data.email || null,
        address: data.address || null,
        updated_at: new Date().toISOString(),
      };

      if (editingSupplier) {
        const { error } = await supabase
          .from('export_suppliers')
          .update(payload)
          .eq('id', editingSupplier.id);
        if (error) throw error;
        setSuccessMessage('Supplier updated successfully.');
      } else {
        const { error } = await supabase
          .from('export_suppliers')
          .insert([payload]);
        if (error) throw error;
        setSuccessMessage('Supplier added successfully.');
      }

      setIsModalOpen(false);
      await fetchData();
    } catch (err: any) {
      setErrorMessage(err.message || 'Error saving supplier.');
    }
  };

  const filteredSuppliers = suppliers.filter(s => {
    const q = searchTerm.toLowerCase();
    return s.name.toLowerCase().includes(q) || 
      (s.contact_person && s.contact_person.toLowerCase().includes(q)) ||
      (s.phone && s.phone.toLowerCase().includes(q));
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white p-6 rounded-xl border border-border shadow-sm">
        <div>
          <h1 className="text-2xl font-bold text-navy flex items-center gap-2">
            <Truck className="text-primary" /> Yarn & Raw Material Suppliers
          </h1>
          <p className="text-secondary-text text-sm mt-1">
            Maintain authorized spinning mill vendors, dye houses, and yarn distributors.
          </p>
        </div>
        <Button onClick={openCreateModal} className="flex items-center gap-2">
          <Plus size={16} /> Add Supplier
        </Button>
      </div>

      {/* Alerts */}
      {errorMessage && (
        <div className="p-4 bg-red-50 text-error border border-red-200 rounded-lg flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertCircle size={18} />
            <span>{errorMessage}</span>
          </div>
          <button onClick={() => setErrorMessage(null)} className="text-xs underline font-medium">Dismiss</button>
        </div>
      )}

      {successMessage && (
        <div className="p-4 bg-green-50 text-success border border-green-200 rounded-lg flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CheckCircle2 size={18} />
            <span>{successMessage}</span>
          </div>
          <button onClick={() => setSuccessMessage(null)} className="text-xs underline font-medium">Dismiss</button>
        </div>
      )}

      {/* Suppliers Table Card */}
      <Card>
        <CardHeader className="border-b border-border/50 pb-4">
          <div className="relative w-full md:w-80">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-secondary-text" size={16} />
            <input
              type="text"
              placeholder="Search suppliers by name or contact..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="w-full h-9 pl-9 pr-4 rounded-lg border border-border text-sm outline-none focus:border-primary transition-all bg-soft-mint/20"
            />
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-12 flex flex-col items-center justify-center">
              <LoadingSpinner size={36} />
              <p className="mt-3 text-secondary-text text-sm">Loading suppliers...</p>
            </div>
          ) : filteredSuppliers.length === 0 ? (
            <div className="p-12 text-center text-secondary-text">
              <Truck size={48} className="mx-auto mb-3 opacity-30 text-primary" />
              <p className="font-semibold text-navy">No suppliers registered</p>
              <p className="text-sm mt-1">Add your yarn mills and material suppliers.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Supplier Name</TableHead>
                  <TableHead>Contact Person</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Address</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredSuppliers.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell className="font-bold text-navy">{s.name}</TableCell>
                    <TableCell className="font-medium">{s.contact_person || '—'}</TableCell>
                    <TableCell className="text-sm">
                      {s.phone ? (
                        <span className="flex items-center gap-1.5 text-navy">
                          <Phone size={13} className="text-secondary-text" /> {s.phone}
                        </span>
                      ) : '—'}
                    </TableCell>
                    <TableCell className="text-sm">
                      {s.email ? (
                        <span className="flex items-center gap-1.5 text-navy">
                          <Mail size={13} className="text-secondary-text" /> {s.email}
                        </span>
                      ) : '—'}
                    </TableCell>
                    <TableCell className="text-xs text-secondary-text">
                      {s.address ? (
                        <span className="flex items-center gap-1">
                          <MapPin size={12} className="text-secondary-text shrink-0" /> {s.address}
                        </span>
                      ) : '—'}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button size="sm" variant="outline" onClick={() => openEditModal(s)} className="text-xs">
                        Edit
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Supplier Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={editingSupplier ? "Edit Supplier" : "Add Material Supplier"}
      >
        <form onSubmit={handleSubmit(onSaveSupplier)} className="space-y-4">
          <Input
            label="Supplier / Mill Name *"
            placeholder="e.g. Vardhman Textiles Ltd"
            {...register('name')}
            error={errors.name?.message}
          />

          <Input
            label="Key Contact Person"
            placeholder="e.g. Rajesh Sharma"
            {...register('contact_person')}
          />

          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Phone Number"
              placeholder="+91 98765 43210"
              {...register('phone')}
            />
            <Input
              label="Email Address"
              type="email"
              placeholder="sales@vardhman.com"
              {...register('email')}
              error={errors.email?.message}
            />
          </div>

          <Input
            label="Mill / Office Address"
            placeholder="e.g. Spinning Division, Ludhiana, Punjab"
            {...register('address')}
          />

          <div className="flex justify-end gap-3 pt-4 border-t border-border">
            <Button type="button" variant="outline" onClick={() => setIsModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" isLoading={isSubmitting}>
              {editingSupplier ? "Save Changes" : "Register Supplier"}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
