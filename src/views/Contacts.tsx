import React, { useState, useRef, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Upload, Download, Users, FileSpreadsheet, Plus, Trash2 } from 'lucide-react';
import * as XLSX from 'xlsx';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { useAppContext } from '../context/AppContext';
import { Contact } from '../types';
import { useDbApi } from '../hooks/useDbApi';
import toast from 'react-hot-toast';

export function Contacts() {
  const [dragActive, setDragActive] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [selectedList, setSelectedList] = useState<string>('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { contacts, setContacts, addActivity, apiCredentials, lists, setLists } = useAppContext();
  const db = useDbApi(apiCredentials);
  const [creatingList, setCreatingList] = useState(false);
  const [newListName, setNewListName] = useState('');
  const [renaming, setRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState('');

  useEffect(() => {
    const init = async () => {
      try {
        const ls = await db.getLists();
        setLists(ls);
        if (ls[0]) setSelectedList(ls[0]._id);
        if (ls[0]) {
          const cs = await db.getContacts(ls[0]._id);
          setContacts(cs.map((c: any) => ({ Nombre: c.nombre, Numero: c.numero, email: c.email })));
        }
      } catch {}
    };
    init();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiCredentials]);

  const refreshContactsFor = async (listId: string) => {
    try {
      const refreshed = await db.getContacts(listId);
      setContacts(refreshed.map((c: any) => ({ Nombre: c.nombre, Numero: c.numero, email: c.email })));
    } catch {}
  };

  const refreshLists = async (keepSelection = false) => {
    try {
      const ls = await db.getLists();
      setLists(ls);
      if (!keepSelection) {
        setSelectedList(ls[0]?._id || '');
        if (ls[0]?._id) await refreshContactsFor(ls[0]._id);
        else setContacts([]);
      }
    } catch {}
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    
    const files = e.dataTransfer.files;
    if (files && files[0]) {
      handleFile(files[0]);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files[0]) {
      handleFile(files[0]);
    }
  };

  const handleFile = async (file: File) => {
    const validTypes = [
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-excel'
    ];

    if (!validTypes.includes(file.type)) {
      toast.error('Archivo inválido. Usa formato Excel (.xlsx o .xls)');
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      toast.error('Archivo muy grande. Máximo 10MB');
      return;
    }

    setUploading(true);
    
    try {
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data, { type: 'array' });
      const firstSheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[firstSheetName];
      const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as any[][];

      if (jsonData.length <= 1) {
        toast.error('El archivo Excel no contiene datos');
        return;
      }

      const headers = jsonData[0];
      const requiredColumns = ['Nombre', 'Numero'];
      const hasRequiredHeaders = requiredColumns.every(header => headers.includes(header));

      if (!hasRequiredHeaders) {
        toast.error('El archivo Excel debe tener las columnas "Nombre" y "Numero"');
        return;
      }

      const contactsData: Contact[] = jsonData.slice(1)
        .map(row => {
          const contact: any = {};
          headers.forEach((header, index) => {
            if (header) {
              contact[header] = row[index];
            }
          });
          return contact;
        })
        .filter(contact => contact.Numero);

      // Persistir en lista seleccionada; crear lista por defecto si no hay
      let targetList = selectedList;
      try {
        if (!targetList) {
          const created = await db.createList('General');
          setLists([created, ...lists]);
          targetList = created._id;
          setSelectedList(targetList);
        }
        await db.uploadContactsToList(targetList, contactsData);
        await refreshContactsFor(targetList);
      } catch (e) {
        console.error(e);
      }
      toast.success(`${contactsData.length} contactos cargados exitosamente`);
      
      addActivity({
        title: 'Contactos cargados',
        description: `Se procesaron ${contactsData.length} contactos válidos`,
        type: 'success',
      });
    } catch (error) {
      console.error('Error processing file:', error);
      toast.error('Error al procesar el archivo');
    } finally {
      setUploading(false);
    }
  };

  const downloadTemplate = () => {
    const headers = ['Nombre', 'Numero', 'email'];
    const data = [headers];
    const ws = XLSX.utils.aoa_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Contactos");
    XLSX.writeFile(wb, "plantilla_contactos.xlsx");
    
    toast.success('Plantilla descargada');
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="space-y-6"
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-white">Gestión de Contactos</h2>
          <p className="text-gray-400 mt-1">Administra tu lista de contactos</p>
        </div>
        <div className="flex gap-3 items-center">
          <div>
            <label className="block text-xs text-gray-400">Lista</label>
            <select value={selectedList} onChange={async (e) => {
              const id = e.target.value; setSelectedList(id);
              try {
                await refreshContactsFor(id);
              } catch {}
            }} className="rounded bg-gray-700 text-white border-gray-600">
              <option value="">(crear General)</option>
              {lists.map((l: any) => <option key={l._id} value={l._id}>{l.name}</option>)}
            </select>
          </div>
          <div className="flex items-end gap-2 pb-0.5">
            {!creatingList ? (
              <Button variant="secondary" icon={Plus} onClick={() => setCreatingList(true)}>
                Nueva lista
              </Button>
            ) : (
              <div className="flex items-center gap-2">
                <input
                  value={newListName}
                  onChange={(e) => setNewListName(e.target.value)}
                  placeholder="Nombre de la lista"
                  className="rounded bg-gray-700 text-white border border-gray-600 px-2 py-1 text-sm"
                />
                <Button
                  variant="secondary"
                  onClick={async () => {
                    const name = newListName.trim();
                    if (!name) { toast.error('Ingresa un nombre'); return; }
                    try {
                      const created = await db.createList(name);
                      setNewListName('');
                      setCreatingList(false);
                      await refreshLists();
                      setSelectedList(created._id);
                      await refreshContactsFor(created._id);
                      toast.success('Lista creada');
                    } catch (e: any) {
                      toast.error('No se pudo crear la lista');
                    }
                  }}
                >
                  Guardar
                </Button>
                <Button variant="ghost" onClick={() => { setCreatingList(false); setNewListName(''); }}>Cancelar</Button>
              </div>
            )}
            {!!selectedList && !renaming && (
              <Button
                variant="secondary"
                onClick={() => {
                  const listObj: any = lists.find((l: any) => l._id === selectedList);
                  setRenameValue(listObj?.name || '');
                  setRenaming(true);
                }}
              >
                Renombrar
              </Button>
            )}
            {!!selectedList && renaming && (
              <div className="flex items-center gap-2">
                <input
                  value={renameValue}
                  onChange={(e) => setRenameValue(e.target.value)}
                  placeholder="Nuevo nombre"
                  className="rounded bg-gray-700 text-white border border-gray-600 px-2 py-1 text-sm"
                />
                <Button
                  variant="secondary"
                  onClick={async () => {
                    const name = renameValue.trim();
                    if (!name) { toast.error('Ingresa un nombre'); return; }
                    try {
                      await db.renameList(selectedList, name);
                      toast.success('Lista renombrada');
                      setRenaming(false);
                      setRenameValue('');
                      await refreshLists(true);
                    } catch (e) {
                      toast.error('No se pudo renombrar');
                    }
                  }}
                >
                  Guardar
                </Button>
                <Button variant="ghost" onClick={() => { setRenaming(false); setRenameValue(''); }}>Cancelar</Button>
              </div>
            )}
            {!!selectedList && (
              <Button
                variant="ghost"
                icon={Trash2}
                onClick={async () => {
                  const listObj: any = lists.find((l: any) => l._id === selectedList);
                  const name = listObj?.name || '';
                  const confirmDelete = window.confirm(`¿Eliminar la lista "${name}" y sus contactos?`);
                  if (!confirmDelete) return;
                  try {
                    await db.deleteList(selectedList);
                    toast.success('Lista eliminada');
                    await refreshLists();
                  } catch (e) {
                    toast.error('No se pudo eliminar la lista');
                  }
                }}
              >
                Eliminar
              </Button>
            )}
          </div>
          <Button
            variant="secondary"
            icon={Download}
            onClick={downloadTemplate}
          >
            Descargar Plantilla
          </Button>
          <Button
            icon={Upload}
            onClick={() => fileInputRef.current?.click()}
          >
            Cargar Contactos
          </Button>
        </div>
      </div>

      {/* Upload Area */}
      <Card>
        <div
          className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
            dragActive 
              ? 'border-green-500 bg-green-500/10' 
              : 'border-gray-600 hover:border-gray-500'
          }`}
          onDragEnter={handleDrag}
          onDragLeave={handleDrag}
          onDragOver={handleDrag}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls"
            onChange={handleFileSelect}
            className="hidden"
          />
          
          <FileSpreadsheet className="w-16 h-16 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-white mb-2">
            {uploading ? 'Procesando archivo...' : 'Arrastra tu archivo Excel aquí'}
          </h3>
          <p className="text-gray-400 mb-4">
            o <span className="text-green-400 hover:text-green-300 cursor-pointer">haz clic para seleccionar</span>
          </p>
          <p className="text-sm text-gray-500">
            Formatos soportados: .xlsx, .xls (Máximo 10MB)
          </p>
        </div>
      </Card>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card>
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-green-600 rounded-lg flex items-center justify-center">
              <Users className="w-6 h-6 text-white" />
            </div>
            <div>
              <p className="text-2xl font-bold text-white">{contacts.length}</p>
              <p className="text-gray-400 text-sm">Contactos Válidos</p>
            </div>
          </div>
        </Card>
        
        <Card>
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-blue-600 rounded-lg flex items-center justify-center">
              <FileSpreadsheet className="w-6 h-6 text-white" />
            </div>
            <div>
              <p className="text-2xl font-bold text-white">Excel</p>
              <p className="text-gray-400 text-sm">Formato Soportado</p>
            </div>
          </div>
        </Card>
        
        <Card>
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-yellow-600 rounded-lg flex items-center justify-center">
              <Upload className="w-6 h-6 text-white" />
            </div>
            <div>
              <p className="text-2xl font-bold text-white">10MB</p>
              <p className="text-gray-400 text-sm">Tamaño Máximo</p>
            </div>
          </div>
        </Card>
      </div>

      {/* Contacts List */}
      {contacts.length > 0 && (
        <Card>
          <h3 className="text-lg font-semibold text-white mb-4">Lista de Contactos</h3>
          <div className="max-h-96 overflow-y-auto space-y-2">
            {contacts.map((contact, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: index * 0.05 }}
                className="flex items-center justify-between p-3 bg-gray-700 rounded-lg"
              >
                <div>
                  <p className="font-medium text-white">{contact.Nombre}</p>
                  <p className="text-sm text-gray-400">{contact.Numero}</p>
                </div>
                {contact.email && (
                  <p className="text-sm text-gray-400">{contact.email}</p>
                )}
              </motion.div>
            ))}
          </div>
        </Card>
      )}
    </motion.div>
  );
}