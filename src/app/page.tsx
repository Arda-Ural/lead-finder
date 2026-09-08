"use client";

import { useMemo, useState } from "react";

type Lead = {
  id: number;
  name: string;
  category: string;
  city: string;
  phone: string | null;
  website: boolean;
  score: number;
  status: "Yeni" | "İncelendi";
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

  function openWhatsApp(lead: Lead) {
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

    let message = `Merhaba ${lead.name} 👋\n\n`;

    message +=
      "İşletmenizi internette incelerken size ulaşmak istedim. " +
      "İşletmelere özel modern web sitesi ve yapay zekâ destekli " +
      "randevu sistemleri geliştiriyorum.\n\n";

    if (lead.website) {
      message +=
        "Mevcut web siteniz için daha modern ve dönüşüm odaklı " +
        "bir yapı üzerine çalışabiliriz.\n\n";
    } else {
      message +=
        "İşletmeniz için size özel profesyonel bir web sitesi ve " +
        "WhatsApp üzerinden çalışan randevu sistemi hazırlayabilirim.\n\n";
    }

    message += "İsterseniz size kısa bir demo gösterebilirim. 😊";

    const url =
      `https://wa.me/${whatsappPhone}?text=` +
      encodeURIComponent(message);

    window.open(url, "_blank");
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
      {/* HEADER */}
      <header className="border-b border-white/10 bg-[#0a0d12]/90">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-5">
          <div>
            <h1 className="text-xl font-bold tracking-tight">
              Lead<span className="text-blue-500">Finder</span>
            </h1>

            <p className="text-xs text-gray-500">
              Otomatik müşteri bulma sistemi
            </p>
          </div>

          <div className="flex items-center gap-3">
            <span className="h-2 w-2 rounded-full bg-green-500 shadow-[0_0_12px_#22c55e]" />

            <span className="text-sm text-gray-400">
              Sistem aktif
            </span>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-6 py-8">
        {/* HERO */}
        <section className="mb-8">
          <p className="mb-2 text-sm font-medium text-blue-500">
            OTOMASYON PANELİ
          </p>

          <h2 className="text-3xl font-bold tracking-tight md:text-4xl">
            Yeni müşterileri
            <br />

            <span className="text-gray-500">
              otomatik olarak keşfet.
            </span>
          </h2>

          <p className="mt-3 max-w-2xl text-gray-400">
            Hedef sektörünü ve bölgeni seç. Sistem potansiyel
            işletmeleri bulsun, analiz etsin ve satış sürecini
            kolaylaştır.
          </p>
        </section>

        {/* SEARCH */}
        <section className="mb-8 rounded-2xl border border-white/10 bg-[#0d1118] p-5">
          <div className="mb-4">
            <h3 className="font-semibold">
              İşletme ara
            </h3>

            <p className="text-sm text-gray-500">
              Hedef müşteri kriterlerini belirle.
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-[1fr_1fr_auto]">
            <div>
              <label className="mb-2 block text-xs text-gray-500">
                SEKTÖR
              </label>

              <input
                value={category}
                onChange={(e) =>
                  setCategory(e.target.value)
                }
                className="w-full rounded-xl border border-white/10 bg-[#080b10] px-4 py-3 outline-none transition focus:border-blue-500"
                placeholder="Örn. Erkek Kuaförü"
              />
            </div>

            <div>
              <label className="mb-2 block text-xs text-gray-500">
                BÖLGE
              </label>

              <input
                value={city}
                onChange={(e) =>
                  setCity(e.target.value)
                }
                className="w-full rounded-xl border border-white/10 bg-[#080b10] px-4 py-3 outline-none transition focus:border-blue-500"
                placeholder="Örn. İstanbul"
              />
            </div>

            <div className="flex items-end">
              <button
                onClick={searchLeads}
                disabled={searching}
                className="w-full rounded-xl bg-blue-600 px-7 py-3 font-semibold transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-60 md:w-auto"
              >
                {searching
                  ? "Aranıyor..."
                  : "🔎 İşletme Bul"}
              </button>
            </div>
          </div>
        </section>

        {/* STATS */}
        <section className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Stat
            title="Toplam Lead"
            value={String(leads.length)}
          />

          <Stat
            title="Yüksek Potansiyel"
            value={String(highPotential)}
          />

          <Stat
            title="Web Sitesi Yok"
            value={String(withoutWebsite)}
          />

          <Stat
            title="Web Sitesi Var"
            value={String(withWebsite)}
          />
        </section>

        {/* LEADS */}
        <section className="overflow-hidden rounded-2xl border border-white/10 bg-[#0d1118]">
          <div className="flex flex-col gap-4 border-b border-white/10 px-5 py-4 md:flex-row md:items-center md:justify-between">
            <div>
              <h3 className="font-semibold">
                Potansiyel müşteriler
              </h3>

              <p className="text-sm text-gray-500">
                {city} · {category}
              </p>
            </div>

            {/* FILTERS */}
            <div className="flex flex-wrap gap-2">
              <FilterButton
                active={filter === "Tümü"}
                onClick={() => setFilter("Tümü")}
              >
                Tümü ({leads.length})
              </FilterButton>

              <FilterButton
                active={filter === "Web Sitesi Yok"}
                onClick={() =>
                  setFilter("Web Sitesi Yok")
                }
              >
                🔴 Web Sitesi Yok ({withoutWebsite})
              </FilterButton>

              <FilterButton
                active={filter === "Web Sitesi Var"}
                onClick={() =>
                  setFilter("Web Sitesi Var")
                }
              >
                🟢 Web Sitesi Var ({withWebsite})
              </FilterButton>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[1000px] text-left">
              <thead className="border-b border-white/10 text-xs text-gray-500">
                <tr>
                  <th className="px-5 py-4">
                    İŞLETME
                  </th>

                  <th className="px-5 py-4">
                    KONUM
                  </th>

                  <th className="px-5 py-4">
                    TELEFON
                  </th>

                  <th className="px-5 py-4">
                    WEB SİTESİ
                  </th>

                  <th className="px-5 py-4">
                    POTANSİYEL
                  </th>

                  <th className="px-5 py-4">
                    DURUM
                  </th>

                  <th className="px-5 py-4">
                    İLETİŞİM
                  </th>
                </tr>
              </thead>

              <tbody>
                {filteredLeads.length > 0 ? (
                  filteredLeads.map((lead) => (
                    <tr
                      key={lead.id}
                      className="border-b border-white/5 transition hover:bg-white/[0.02]"
                    >
                      <td className="px-5 py-5">
                        <div>
                          <p className="font-medium">
                            {lead.name}
                          </p>

                          <p className="mt-1 text-xs text-gray-500">
                            {lead.category}
                          </p>
                        </div>
                      </td>

                      <td className="px-5 py-5 text-sm text-gray-400">
                        {lead.city}
                      </td>

                      <td className="px-5 py-5 text-sm text-gray-400">
                        {lead.phone || "Telefon yok"}
                      </td>

                      <td className="px-5 py-5">
                        {lead.website ? (
                          <span className="rounded-full bg-green-500/10 px-3 py-1 text-xs text-green-400">
                            Var
                          </span>
                        ) : (
                          <span className="rounded-full bg-red-500/10 px-3 py-1 text-xs text-red-400">
                            Yok
                          </span>
                        )}
                      </td>

                      <td className="px-5 py-5">
                        <div className="flex items-center gap-3">
                          <div className="h-2 w-20 overflow-hidden rounded-full bg-white/10">
                            <div
                              className="h-full rounded-full bg-blue-500"
                              style={{
                                width: `${lead.score}%`,
                              }}
                            />
                          </div>

                          <span className="text-sm font-semibold">
                            {lead.score}
                          </span>
                        </div>
                      </td>

                      <td className="px-5 py-5">
                        <span className="rounded-full bg-white/5 px-3 py-1 text-xs text-gray-400">
                          {lead.status}
                        </span>
                      </td>

                      <td className="px-5 py-5">
                        {lead.phone ? (
                          <button
                            onClick={() =>
                              openWhatsApp(lead)
                            }
                            className="whitespace-nowrap rounded-lg bg-green-600 px-3 py-2 text-xs font-semibold transition hover:bg-green-500"
                          >
                            💬 WhatsApp
                          </button>
                        ) : (
                          <span className="text-xs text-gray-600">
                            Numara yok
                          </span>
                        )}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td
                      colSpan={7}
                      className="px-5 py-12 text-center"
                    >
                      <p className="text-gray-400">
                        Bu filtreye uygun işletme bulunamadı.
                      </p>

                      <button
                        onClick={() =>
                          setFilter("Tümü")
                        }
                        className="mt-3 text-sm text-blue-500 hover:text-blue-400"
                      >
                        Tüm işletmeleri göster
                      </button>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="border-t border-white/10 px-5 py-4">
            <p className="text-xs text-gray-500">
              {filteredLeads.length} işletme gösteriliyor
            </p>
          </div>
        </section>

        {/* FEATURES */}
        <section className="mt-8 grid gap-4 md:grid-cols-3">
          <Feature
            number="01"
            title="İşletme keşfi"
            text="Hedeflediğin sektördeki işletmeleri otomatik olarak topla."
          />

          <Feature
            number="02"
            title="AI analizi"
            text="Her işletmenin müşteri olma potansiyelini otomatik değerlendir."
          />

          <Feature
            number="03"
            title="Outreach"
            text="Uygun iletişim kanallarından kişiselleştirilmiş iletişim akışı oluştur."
          />
        </section>
      </div>
    </main>
  );
}

function Stat({
  title,
  value,
}: {
  title: string;
  value: string;
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-[#0d1118] p-5">
      <p className="text-sm text-gray-500">
        {title}
      </p>

      <p className="mt-2 text-3xl font-bold">
        {value}
      </p>
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
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-lg border px-3 py-2 text-xs font-medium transition ${
        active
          ? "border-blue-500 bg-blue-500/10 text-blue-400"
          : "border-white/10 text-gray-400 hover:bg-white/5"
      }`}
    >
      {children}
    </button>
  );
}

function Feature({
  number,
  title,
  text,
}: {
  number: string;
  title: string;
  text: string;
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-[#0d1118] p-5">
      <span className="text-xs font-bold text-blue-500">
        {number}
      </span>

      <h3 className="mt-3 font-semibold">
        {title}
      </h3>

      <p className="mt-2 text-sm leading-6 text-gray-500">
        {text}
      </p>
    </div>
  );
}
