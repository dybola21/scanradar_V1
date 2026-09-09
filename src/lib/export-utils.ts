import { saveAs } from "file-saver";
import * as XLSX from "xlsx";
import { LeadRecord } from "./schemas";

const formatDataEnvio = (lead: LeadRecord): string => {
  if (!lead.data_envio) return "";
  try {
    return new Date(lead.data_envio).toLocaleString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return lead.data_envio;
  }
};

export const exportToCSV = (leads: LeadRecord[], filename: string) => {
  const headers = [
    "Nome",
    "Telefone",
    "E-mail",
    "E-mail 2",
    "Website",
    "Bairro",
    "Cidade",
    "UF",
    "Status",
    "Mensagem Enviada",
    "Data de Envio",
  ];
  const rows = leads.map((lead) => [
    lead.nome || "",
    lead.telefone || "",
    lead.email || "",
    lead.email2 || "",
    lead.website || "",
    lead.bairro || "",
    lead.cidade || "",
    lead.uf || "",
    lead.status || "pendente",
    lead.mensagem_enviada ? "Sim" : "Não",
    formatDataEnvio(lead),
  ]);

  const csvContent = [
    headers.join(","),
    ...rows.map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(",")),
  ].join("\n");

  // UTF-8 BOM for Excel compatibility
  const blob = new Blob(["\ufeff" + csvContent], { type: "text/csv;charset=utf-8;" });
  saveAs(blob, filename);
};

export const exportToExcel = (leads: LeadRecord[], filename: string) => {
  const data = leads.map((lead) => ({
    Nome: lead.nome || "",
    Telefone: lead.telefone || "",
    "E-mail": lead.email || "",
    "E-mail 2": lead.email2 || "",
    Website: lead.website || "",
    Bairro: lead.bairro || "",
    Cidade: lead.cidade || "",
    UF: lead.uf || "",
    Status: lead.status || "pendente",
    "Mensagem Enviada": lead.mensagem_enviada ? "Sim" : "Não",
    "Data de Envio": formatDataEnvio(lead),
  }));

  const worksheet = XLSX.utils.json_to_sheet(data);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Leads");

  const excelBuffer = XLSX.write(workbook, { bookType: "xlsx", type: "array" });
  const blob = new Blob([excelBuffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  saveAs(blob, filename);
};
