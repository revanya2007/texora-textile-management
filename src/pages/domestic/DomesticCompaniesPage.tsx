import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Card, CardHeader, CardContent } from '../../components/ui/Card';
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from '../../components/ui/Table';
import { Modal } from '../../components/ui/Modal';
import { LoadingSpinner } from '../../components/ui/LoadingSpinner';
import { Plus, Search, Briefcase, Phone, MapPin, AlertCircle, CheckCircle2 } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';

interface DomesticCompany {
  id: string;
  name: string;
  contact_person?: string;
  phone?: string;
  address?: string;
  notes?: string;
  is_active: boolean;
  created_at: string;
}

const companySchema = z.object({
  name: z.string().min(1, 'Company name is required'),
  contact_person: z.string().optional(),
  phone: z.string().optional(),
  address: z.string().optional(),
  notes: z.string().optional(),
  is_active: z.boolean(),
});

type CompanyFormValues = z.infer<typeof companySchema>;

export default function DomesticCompaniesPage() {
  const [companies, setCompanies] = useState<DomesticCompany[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingCompany, setEditingCompany] = useState<DomesticCompany | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const { register, handleSubmit, reset, setValue, formState: { errors, isSubmitting } } = useForm<CompanyFormValues>({
    resolver: zodResolver(companySchema),
    defaultValues: { is_active: true },
  });

  const fetchData = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('domestic_companies')
        .select('*')
        .order('name', { ascending: true });

      if (error) throw error;
      setCompanies(data || []);
    } catch (err: any) {
      console.error('Error fetching domestic companies:', err);
      setErrorMessage(err.message || 'Failed to load domestic companies.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const openCreateModal = () => {
    setEditingCompany(null);
    reset({ name: '', contact_person: '', phone: '', address: '', notes: '', is_active: true });
    setErrorMessage(null);
    setIsModalOpen(true);
  };

  const openEditModal = (company: DomesticCompany) => {
    setEditingCompany(company);
    setValue('name', company.name);
    setValue('contact_person', company.contact_person || '');
    setValue('phone', company.phone || '');
    setValue('address', company.address || '');
    setValue('notes', company.notes || '');
    setValue('is_active', company.is_active);
    setErrorMessage(null);
    setIsModalOpen(true);
  };

  const onSaveCompany = async (data: CompanyFormValues) => {
    setErrorMessage(null);
    try {
      const payload = {
        name: data.name,
        contact_person: data.contact_person || null,
        phone: data.phone || null,
        address: data.address || null,
        notes: data.notes || null,
        is_active: data.is_active,
      };

      if (editingCompany) {
        const { error } = await supabase
          .from('domestic_companies')
          .update(payload)
          .eq('id', editingCompany.id);
        if (error) throw error;
        setSuccessMessage('Domestic company updated successfully.');
      } else {
        const { error } = await supabase
          .from('domestic_companies')
          .insert([payload]);
        if (error) throw error;
        setSuccessMessage('Domestic company registered successfully.');
      }

      setIsModalOpen(false);
      await fetchData();
    } catch (err: any) {
      setErrorMessage(err.message || 'Error saving domestic company.');
    }
  };

  const filteredCompanies = companies.filter(c => {
    const q = searchTerm.toLowerCase();
    return c.name.toLowerCase().includes(q) || 
      (c.contact_person && c.contact_person.toLowerCase().includes(q)) ||
      (c.phone && c.phone.toLowerCase().includes(q));
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white p-6 rounded-xl border border-border shadow-sm">
        <div>
          <h1 className="text-2xl font-bold text-navy flex items-center gap-2">
            <Briefcase className="text-primary" /> Domestic Partner Companies
          </h1>
          <p className="text-secondary-text text-sm mt-1">
            Maintain local textile houses, garment manufacturers, and job-work contractors.
          </p>
        </div>
        <Button onClick={openCreateModal} className="flex items-center gap-2">
          <Plus size={16} /> Add Company
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
        <CardHeader className="border-b border-border/50 pb-4">
          <div className="relative w-full md:w-80">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-secondary-text" size={16} />
            <input
              type="text"
              placeholder="Search companies by name..."
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
              <p className="mt-3 text-secondary-text text-sm">Loading companies...</p>
            </div>
          ) : filteredCompanies.length === 0 ? (
            <div className="p-12 text-center text-secondary-text">
              <Briefcase size={48} className="mx-auto mb-3 opacity-30 text-primary" />
              <p className="font-semibold text-navy">No domestic companies found</p>
              <p className="text-sm mt-1">Add your partner companies to create work orders.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Company Name</TableHead>
                  <TableHead>Contact Person</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>Address</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredCompanies.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="font-bold text-navy">{c.name}</TableCell>
                    <TableCell className="font-medium">{c.contact_person || '—'}</TableCell>
                    <TableCell className="text-sm">
                      {c.phone ? (
                        <span className="flex items-center gap-1.5 text-navy"><Phone size={13} className="text-secondary-text" /> {c.phone}</span>
                      ) : '—'}
                    </TableCell>
                    <TableCell className="text-xs text-secondary-text">
                      {c.address ? (
                        <span className="flex items-center gap-1"><MapPin size={12} className="text-secondary-text shrink-0" /> {c.address}</span>
                      ) : '—'}
                    </TableCell>
                    <TableCell>
                      <span className={`text-xs px-2.5 py-1 rounded-full font-semibold ${
                        c.is_active ? 'bg-green-50 text-success border border-green-200' : 'bg-gray-100 text-gray-700'
                      }`}>
                        {c.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button size="sm" variant="outline" onClick={() => openEditModal(c)} className="text-xs">
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

      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={editingCompany ? "Edit Domestic Company" : "Add Domestic Company"}
      >
        <form onSubmit={handleSubmit(onSaveCompany)} className="space-y-4">
          <Input
            label="Company Name *"
            placeholder="e.g. Tirupur Garments & Apparels"
            {...register('name')}
            error={errors.name?.message}
          />

          <Input
            label="Contact Person"
            placeholder="e.g. Murugan Vel"
            {...register('contact_person')}
          />

          <Input
            label="Phone Number"
            placeholder="+91 94432 10987"
            {...register('phone')}
          />

          <Input
            label="Factory / Office Address"
            placeholder="e.g. PN Road, Tirupur, Tamil Nadu"
            {...register('address')}
          />

          <Input
            label="Notes & Terms"
            placeholder="Contract terms, GSTIN..."
            {...register('notes')}
          />

          <div className="flex justify-end gap-3 pt-4 border-t border-border">
            <Button type="button" variant="outline" onClick={() => setIsModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" isLoading={isSubmitting}>
              {editingCompany ? "Save Changes" : "Register Company"}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
