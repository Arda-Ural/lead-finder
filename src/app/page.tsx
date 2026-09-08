"use client";

import { useMemo, useState, type ReactNode } from "react";

type Lead = {
  id: number;
  name: string;
  category: string;
  city: string;
  phone: string | null;
  website: boolean;
  score: number;
  status:
    | "Yeni"
    | "İncelendi"
    | "Mesaj Hazır"
    | "WhatsApp Açıldı"
    | "Gönderildi"
    | "Cevap Geldi"
    | "Olumsuz";
  address?: string;
  mapsUrl?: string | null;
};

const demoLeads: Lead[] = [
  {
    id: 1,
    name: "Elite Barber",
    category: "Erkek Kuaförü",
    city: "Kadıköy",
    phone: "0532 000 00 01",
    website: false,
    score: 94,
    status: "Yeni",
  },
  {
    id: 2,
    name: "The Gentleman's Club",
    category: "Erkek Kuaförü",
    city: "Etiler",
    phone: "0532 000 00 02",
    website: false,
    score: 91,
    status: "Yeni",
  },
  {
    id: 3,
    name: "Premium Hair Studio",
    category: "Kuaför",
    city: "Beşiktaş",
    phone: "0532 000 00 03",
    website: true,
    score: 67,
    status: "İncelendi",
  },
];

export default function Home() {
  const [category, setCategory] = useState("Erkek Kuaförü");
  const [city, setCity] = useState("İstanbul");
  const [leads, setLeads] = useState<Lead[]>(demoLeads);
  const [searching, setSearching] = useState(false);

  const [filter, setFilter] = useState<
    "Tümü" | "Web Sitesi Yok" | "Web Sitesi Var"
  >("Tümü");

  const [editingLead, setEditingLead] = useState<Lead | null>(null);

  const [message, setMessage] = useState("");
  const [queue, setQueue] = useState<Lead[]>([]);
  const [queueIndex, setQueueIndex] = useState(0);

  async function searchLeads() {
    if (!category.trim() || !city.trim()) {
      alert("Lütfen sektör ve bölge gir.");
      return;
    }

    setSearching(true);

    try {
      const response = await fetch("/api/leads/search", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          category: category.trim(),
          city: city.trim(),
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        console.error("API Hatası:", data);
        alert(data.error || "İşletmeler alınamadı.");
        return;
      }

      const googleLeads: Lead[] = data.leads.map(
        (lead: any, index: number) => ({
          id: index + 1,
          name: lead.name,
          category: category.trim(),
          city: city.trim(),
          phone: lead.phone || null,
          website: Boolean(lead.hasWebsite),
          score: lead.score,
          status: "Yeni",
          address: lead.address || "",
          mapsUrl: lead.mapsUrl || null,
        })
      );

      setLeads(googleLeads);
      setFilter("Tümü");
    } catch (error) {
      console.error("Bağlantı hatası:", error);
      alert("Sunucuya bağlanırken hata oluştu.");
    } finally {
      setSearching(false);
    }
  }

  function createMessage(lead: Lead) {
    let newMessage = `Merhaba ${lead.name} 👋\n\n`;

    newMessage +=
      "İşletmenizi internette incelerken size ulaşmak istedim. " +
      "İşletmelere özel profesyonel web siteleri, yapay zekâ destekli " +
      "randevu sistemleri ve dijital çözümler geliştiriyorum.\n\n";

    if (lead.website) {
      newMessage +=
        "Mevcut web sitenizi inceledim. Daha modern, hızlı ve " +
        "müşteri dönüşümünü artırmaya yönelik bir yapı konusunda " +
        "size yardımcı olabilirim.\n\n";
    } else {
      newMessage +=
        "Şu anda işletmenize ait profesyonel bir web sitesi " +
        "göremedim. İşletmenize özel modern bir web sitesi ve " +
        "WhatsApp üzerinden çalışan randevu sistemi hazırlayabilirim.\n\n";
    }

    newMessage +=
      "İsterseniz işletmenize özel hazırladığım kısa bir demo " +
      "gösterebilirim. Herhangi bir yükümlülük bulunmuyor. 😊";

    return newMessage;
  }

  function openWhatsApp(lead: Lead, customMessage?: string) {
    if (!lead.phone) {
      alert("Bu işletmenin telefon numarası bulunamadı.");
      return;
    }

    const phone = lead.phone.replace(/\D/g, "");

    let whatsappPhone = phone;

    if (phone.startsWith("0")) {
      whatsappPhone = "90" + phone.substring(1);
    } else if (phone.startsWith("5")) {
      whatsappPhone = "90" + phone;
    }

    const finalMessage = customMessage || createMessage(lead);

    const url =
      `https://wa.me/${whatsappPhone}?text=` +
      encodeURIComponent(finalMessage);

    window.open(url, "_blank");
  }

  function editMessage(lead: Lead) {
    setEditingLead(lead);
    setMessage(createMessage(lead));
  }
  function startQueue() {
    const potentialLeads = leads.filter(
      (lead) => lead.score >= 80 && !lead.website && lead.phone
    );

    if (potentialLeads.length === 0) {
      alert("İletişime uygun yüksek potansiyelli lead bulunamadı.");
      return;
    }

    setQueue(potentialLeads);
    setQueueIndex(0);

    const firstLead = potentialLeads[0];
    setEditingLead(firstLead);
    setMessage(createMessage(firstLead));
  }

  function nextQueueLead() {
    if (queueIndex + 1 >= queue.length) {
      alert("🎉 Tüm leadler tamamlandı!");
      setQueue([]);
      setQueueIndex(0);
      setEditingLead(null);
      setMessage("");
      return;
    }

    const nextIndex = queueIndex + 1;
    const nextLead = queue[nextIndex];

    setQueueIndex(nextIndex);
    setEditingLead(nextLead);
    setMessage(createMessage(nextLead));
  }

  function sendEditedMessage() {
    if (!editingLead) return;

    openWhatsApp(editingLead, message);

    setLeads((prev) =>
      prev.map((lead) =>
        lead.id === editingLead.id
          ? { ...lead, status: "WhatsApp Açıldı" }
          : lead
      )
    );

    setEditingLead(null);
    setMessage("");
  }

  function handleStatusChange(
    leadId: number,
    status: Lead["status"]
  ) {
    setLeads((prev) =>
      prev.map((lead) =>
        lead.id === leadId
          ? { ...lead, status }
          : lead
      )
    );
  }

  const highPotential = leads.filter(
    (lead) => lead.score >= 80
  ).length;

  const withoutWebsite = leads.filter(
    (lead) => !lead.website
  ).length;

  const withWebsite = leads.filter(
    (lead) => lead.website
  ).length;

  const filteredLeads = useMemo(() => {
    if (filter === "Web Sitesi Yok") {
      return leads.filter((lead) => !lead.website);
    }

    if (filter === "Web Sitesi Var") {
      return leads.filter((lead) => lead.website);
    }

    return leads;
  }, [leads, filter]);

  return (
    <main className="min-h-screen bg-[#07090d] text-white">
      <div className="mx-auto max-w-7xl px-6 py-10">

        <header className="mb-10">
          <div className="mb-3 inline-flex rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-gray-300">
            🚀 AI Lead Finder
          </div>

          <h1 className="text-4xl font-bold tracking-tight md:text-6xl">
            Potansiyel müşterilerini
            <span className="block text-blue-400">
              daha hızlı bul.
            </span>
          </h1>

          <p className="mt-4 max-w-2xl text-gray-400">
            İşletmeleri bul, web sitesi durumlarını kontrol et,
            potansiyel müşterileri filtrele ve WhatsApp üzerinden
            kişiselleştirilmiş mesaj gönder.
          </p>
        </header>

        <section className="mb-8 rounded-3xl border border-white/10 bg-white/[0.03] p-6">
          <div className="grid gap-4 md:grid-cols-[1fr_1fr_auto]">

            <div>
              <label className="mb-2 block text-sm text-gray-400">
                Sektör
              </label>

              <input
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                placeholder="Örn: Erkek Kuaförü"
                className="w-full rounded-xl border border-white/10 bg-black/30 px-4 py-3 outline-none transition focus:border-blue-500"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm text-gray-400">
                Şehir / Bölge
              </label>

              <input
                value={city}
                onChange={(e) => setCity(e.target.value)}
                placeholder="Örn: İstanbul"
                className="w-full rounded-xl border border-white/10 bg-black/30 px-4 py-3 outline-none transition focus:border-blue-500"
              />
            </div>

            <div className="flex items-end">
              <button
                onClick={searchLeads}
                disabled={searching}
                className="w-full rounded-xl bg-blue-600 px-6 py-3 font-semibold transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {searching ? "Aranıyor..." : "🔎 İşletmeleri Bul"}
              </button>
            </div>

          </div>
        </section>

        <section className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">

          <Stat
            title="Toplam Lead"
            value={leads.length}
            icon="👥"
          />

          <Stat
            title="Yüksek Potansiyel"
            value={highPotential}
            icon="🔥"
          />

          <Stat
            title="Web Sitesi Yok"
            value={withoutWebsite}
            icon="🌐"
          />

          <Stat
            title="Web Sitesi Var"
            value={withWebsite}
            icon="✅"
          />

        </section>
<section className="mb-6 flex flex-wrap items-center justify-between gap-4">
  <div>
    <h2 className="text-lg font-semibold">
      🎯 Satış Aksiyonu
    </h2>

    <p className="mt-1 text-sm text-gray-400">
      Yüksek potansiyelli işletmelerle sırayla iletişime geç.
    </p>
  </div>

  <button
    onClick={startQueue}
    className="rounded-xl bg-gradient-to-r from-orange-500 to-red-500 px-5 py-3 font-semibold transition hover:scale-[1.02] hover:from-orange-400 hover:to-red-400"
  >
    🔥 Potansiyel Lead'lere Başla
  </button>
</section>
        <section className="mb-6 flex flex-wrap gap-3">

          <FilterButton
            active={filter === "Tümü"}
            onClick={() => setFilter("Tümü")}
          >
            Tümü ({leads.length})
          </FilterButton>

          <FilterButton
            active={filter === "Web Sitesi Yok"}
            onClick={() => setFilter("Web Sitesi Yok")}
          >
            🌐 Web Sitesi Yok ({withoutWebsite})
          </FilterButton>

          <FilterButton
            active={filter === "Web Sitesi Var"}
            onClick={() => setFilter("Web Sitesi Var")}
          >
            ✅ Web Sitesi Var ({withWebsite})
          </FilterButton>

        </section>

        <section className="space-y-4">

          {filteredLeads.length === 0 ? (
            <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-12 text-center">
              <div className="mb-3 text-4xl">🔍</div>

              <h3 className="text-xl font-semibold">
                Lead bulunamadı
              </h3>

              <p className="mt-2 text-gray-400">
                Bu filtreye uygun işletme bulunmuyor.
              </p>
            </div>
          ) : (
            filteredLeads.map((lead) => (
              <LeadCard
                key={lead.id}
                lead={lead}
                onWhatsApp={openWhatsApp}
                onEditMessage={editMessage}
                onStatusChange={handleStatusChange}
              />
            ))
          )}

        </section>

      </div>

      {editingLead && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 backdrop-blur-sm">
          <div className="w-full max-w-2xl rounded-3xl border border-white/10 bg-[#11141a] p-6 shadow-2xl">

            <div className="mb-5 flex items-center justify-between">
              <div>
                <h2 className="text-2xl font-bold">
                  ✏️ Mesajı Düzenle
                </h2>

                <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-gray-400">
                  <span>
                    {editingLead.name} için WhatsApp mesajı
                  </span>

                  {queue.length > 0 && (
                    <span className="rounded-full bg-blue-500/10 px-3 py-1 text-xs font-semibold text-blue-400">
                      Lead {queueIndex + 1} / {queue.length}
                    </span>
                  )}
                </div>
              </div>

              <button
                onClick={() => {
                  setEditingLead(null);
                  setMessage("");
                }}
                className="rounded-xl px-3 py-2 text-gray-400 transition hover:bg-white/10 hover:text-white"
              >
                ✕
              </button>
            </div>

            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={12}
              className="w-full resize-none rounded-2xl border border-white/10 bg-black/30 p-4 text-sm leading-6 text-white outline-none transition focus:border-blue-500"
            />

            <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:justify-end">

              <button
                onClick={() => {
                  setEditingLead(null);
                  setMessage("");
                }}
                className="rounded-xl border border-white/10 px-5 py-3 font-semibold text-gray-300 transition hover:bg-white/10"
              >
                Vazgeç
              </button>

              {queue.length > 0 && (
                <button
                  onClick={nextQueueLead}
                  className="rounded-xl border border-blue-500/30 bg-blue-500/10 px-5 py-3 font-semibold text-blue-400 transition hover:bg-blue-500/20"
                >
                  ➡️ Sonraki Lead
                </button>
              )}

              <button
                onClick={sendEditedMessage}
                disabled={!message.trim()}
                className="rounded-xl bg-green-600 px-5 py-3 font-semibold transition hover:bg-green-500 disabled:cursor-not-allowed disabled:opacity-40"
              >
                💬 WhatsApp'ta Aç
              </button>

            </div>

          </div>
        </div>
      )}

    </main>
  );
}

function Stat({
  title,
  value,
  icon,
}: {
  title: string;
  value: number;
  icon: string;
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
      <div className="mb-3 text-2xl">{icon}</div>

      <div className="text-3xl font-bold">
        {value}
      </div>

      <div className="mt-1 text-sm text-gray-400">
        {title}
      </div>
    </div>
  );
}

function FilterButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-xl border px-4 py-2 text-sm font-medium transition ${
        active
          ? "border-blue-500 bg-blue-600 text-white"
          : "border-white/10 bg-white/[0.03] text-gray-300 hover:bg-white/[0.08]"
      }`}
    >
      {children}
    </button>
  );
}

function LeadCard({
  lead,
  onWhatsApp,
  onEditMessage,
  onStatusChange,
}: {
  lead: Lead;
  onWhatsApp: (lead: Lead) => void;
  onEditMessage: (lead: Lead) => void;
  onStatusChange: (leadId: number, status: Lead["status"]) => void;
}) {
  return (
    <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-6 transition hover:border-white/20">

      <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">

        <div className="flex-1">

          <div className="mb-3 flex flex-wrap items-center gap-3">

            <h2 className="text-xl font-bold">
              {lead.name}
            </h2>

            <span
              className={`rounded-full px-3 py-1 text-xs font-semibold ${
                lead.website
                  ? "bg-green-500/10 text-green-400"
                  : "bg-red-500/10 text-red-400"
              }`}
            >
              {lead.website
                ? "Web Sitesi Var"
                : "Web Sitesi Yok"}
            </span>

            <span
              className={`rounded-full px-3 py-1 text-xs font-semibold ${
                lead.status === "Yeni"
                  ? "bg-blue-500/10 text-blue-400"
                  : lead.status === "Mesaj Hazır"
                  ? "bg-yellow-500/10 text-yellow-400"
                  : lead.status === "WhatsApp Açıldı"
                  ? "bg-purple-500/10 text-purple-400"
                  : lead.status === "Gönderildi"
                  ? "bg-green-500/10 text-green-400"
                  : lead.status === "Cevap Geldi"
                  ? "bg-cyan-500/10 text-cyan-400"
                  : "bg-gray-500/10 text-gray-400"
              }`}
            >
              {lead.status}
            </span>

            <select
              value={lead.status}
              onChange={(e) =>
                onStatusChange(
                  lead.id,
                  e.target.value as Lead["status"]
                )
              }
              className="rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-white outline-none transition hover:bg-white/10"
            >
              <option value="Yeni">Yeni</option>
              <option value="İncelendi">İncelendi</option>
              <option value="Mesaj Hazır">Mesaj Hazır</option>
              <option value="WhatsApp Açıldı">WhatsApp Açıldı</option>
              <option value="Gönderildi">Gönderildi</option>
              <option value="Cevap Geldi">Cevap Geldi</option>
              <option value="Olumsuz">Olumsuz</option>
            </select>

          </div>

          <div className="grid gap-2 text-sm text-gray-400 md:grid-cols-2">

            <div>
              📂 {lead.category}
            </div>

            <div>
              📍 {lead.city}
            </div>

            <div>
              📞 {lead.phone || "Telefon bulunamadı"}
            </div>

            {lead.address && (
              <div>
                🏠 {lead.address}
              </div>
            )}

          </div>

        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">

          <div className="rounded-2xl border border-white/10 bg-black/20 px-5 py-3 text-center">
            <div className="text-xs text-gray-500">
              Potansiyel
            </div>

            <div className="text-2xl font-bold text-blue-400">
              %{lead.score}
            </div>
          </div>

          {lead.mapsUrl && (
            <a
              href={lead.mapsUrl}
              target="_blank"
              rel="noreferrer"
              className="rounded-xl border border-white/10 px-5 py-3 text-center text-sm font-semibold transition hover:bg-white/10"
            >
              📍 Maps
            </a>
          )}

          <button
            onClick={() => onEditMessage(lead)}
            disabled={!lead.phone}
            className="rounded-xl border border-blue-500/30 bg-blue-500/10 px-5 py-3 text-sm font-semibold text-blue-400 transition hover:bg-blue-500/20 disabled:cursor-not-allowed disabled:opacity-40"
          >
            ✏️ Mesajı Düzenle
          </button>

          <button
            onClick={() => onWhatsApp(lead)}
            disabled={!lead.phone}
            className="rounded-xl bg-green-600 px-5 py-3 text-sm font-semibold transition hover:bg-green-500 disabled:cursor-not-allowed disabled:opacity-40"
          >
            💬 WhatsApp
          </button>

        </div>

      </div>

    </div>
  );
}
