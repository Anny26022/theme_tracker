export const THEMATIC_MAP = [
    {
        title: "BANKING & FINANCIAL SERVICES",
        themes: [
            { name: "Public Sector Bank", industries: ["Public Sector Bank Companies"] },
            { name: "Exchanges & Platforms", industries: ["Exchange and Data Platform Companies"] },
            { name: "Private Sector Bank", industries: ["Private Sector Bank Companies"] },
            { name: "Life Insurance", industries: ["Life Insurance Companies"] },
            { name: "Asset Management", industries: ["Asset Management Company Companies"] },
            { name: "Microfinance", industries: ["Microfinance Institutions Companies"] },
            { name: "General Insurance", industries: ["General Insurance Companies"] },
            { name: "PSU Infra Finance", industries: ["Other Financial Services Companies"], symbols: ["PFC", "RECLTD", "IREDA"] },
            { name: "NBFC", industries: ["Non Banking Financial Company (NBFC) Companies"] },
            { name: "Ratings & Analytics", industries: ["Ratings Companies"] },
            { name: "Investment & Holding", industries: ["Holding Company Companies", "Investment Company Companies"] },
            { name: "Housing Finance", industries: ["Housing Finance Company Companies"] },
            { name: "Small Finance Bank", industries: ["Other Bank Companies"], symbols: ["AUFIL", "EQUITASBNK", "UJJIVANSFB"] },
            { name: "Capital Market Intern.", industries: ["Other Capital Market related Services Companies", "Stockbroking & Allied Companies"] },
            { name: "Depositories & Clearing", industries: ["Depositories, Clearing Houses and Other Intermediaries Companies"] },
            { name: "Fintech", industries: ["Financial Technology (Fintech) Companies"] },
            { name: "Financial Institutions", industries: ["Financial Institution Companies"] },
            { name: "Financial Distributors", industries: ["Financial Products Distributor Companies", "Insurance Distributors Companies"] }
        ]
    },
    {
        title: "AUTOMOTIVE (STOCKS)",
        themes: [
            { name: "Commercial Vehicles", industries: ["Commercial Vehicles Companies"] },
            { name: "2/3 Wheelers", industries: ["2/3 Wheelers Companies"] },
            { name: "Tractors & Agri", industries: ["Tractors Companies"] },
            { name: "Auto Dealers & Retail", industries: ["Auto Dealer Companies", "Dealers-Commercial Vehicles, Tractors, Construction Vehicles Companies"] },
            { name: "Passenger Cars", industries: ["Passenger Cars & Utility Vehicles Companies"] }
        ]
    },
    {
        title: "AUTOMOTIVE COMPONENTS",
        themes: [
            { name: "Bearings & Precision", industries: ["Abrasives & Bearings Companies"] },
            { name: "Casting & Forging", industries: ["Castings & Forgings Companies"] },
            { name: "Drivetrain & Axles", industries: ["Auto Components & Equipments Companies"], symbols: ["SONACOMS"] },
            { name: "Electronics & Systems", industries: ["Auto Components & Equipments Companies"], symbols: ["UNO MINDA"] },
            { name: "Chassis & Metal Parts", industries: ["Auto Components & Equipments Companies"] },
            { name: "Suspension & Safety", industries: ["Auto Components & Equipments Companies"] },
            { name: "Interior & Plastics", industries: ["Auto Components & Equipments Companies"] },
            { name: "Engines & Cooling/Seal", industries: ["Auto Components & Equipments Companies"] },
            { name: "Wiring & Cables", industries: ["Auto Components & Equipments Companies"], symbols: ["MOTHERSON"] },
            { name: "Tyres & Wheels", industries: ["Tyres & Rubber Products Companies"] },
            { name: "Batteries & EV", industries: ["Batteries - Automotive & Industrial Companies"] }
        ]
    },
    {
        title: "INFORMATION TECHNOLOGY & TECHNOLOGY",
        themes: [
            { name: "IT Services (Consulting)", industries: ["Computers - Software & Consulting Companies"] },
            { name: "IT Enabled Services (BPM)", industries: ["IT Enabled Services Companies"] },
            { name: "ER&D / Product Software", industries: ["Computers - Software & Consulting Companies"], symbols: ["LTTS", "TATAELXSI", "CYIENT", "KPITTECH", "PERSISTENT", "COFORGE"] },
            { name: "Enterprise Platforms", industries: ["Software Products Companies"] },
            { name: "Telecom & Network Infra", industries: ["Telecom - Infrastructure Companies", "Telecom - Equipment & Accessories Companies"], symbols: ["INDUSTOWER", "RAILTEL", "HFCL", "STLTECH"] },
            { name: "E-Learning / EdTech", industries: ["E-Learning Companies"] },
            { name: "Digital Services & BPO", industries: ["Business Process Outsourcing (BPO)/ Knowledge Process Outsourcing (KPO) Companies"] },
            { name: "Web Content & Connectivity", industries: ["Web based media and service Companies"] }
        ]
    },
    {
        title: "CHEMICALS SECTOR",
        themes: [
            { name: "Industrial Gases", industries: ["Industrial Gases Companies"] },
            { name: "Specialty Chemicals", industries: ["Specialty Chemicals Companies"] },
            { name: "Petrochemicals", industries: ["Petrochemicals Companies"] },
            { name: "Commodity Chemicals", industries: ["Commodity Chemicals Companies"] },
            { name: "Dyes & Pigments", industries: ["Dyes And Pigments Companies"] },
            { name: "Carbon Black", industries: ["Carbon Black Companies"] }
        ]
    },
    {
        title: "ENGINEERING & MANUFACTURING",
        themes: [
            { name: "Heavy Electrical Equip", industries: ["Heavy Electrical Equipment Companies"] },
            { name: "Compressors & Pumps", industries: ["Compressors, Pumps & Diesel Engines Companies"] },
            { name: "Castings & Forgings", industries: ["Castings & Forgings Companies"] },
            { name: "Industrial Rubber", industries: ["Rubber Companies"] },
            { name: "Industrial Products", industries: ["Industrial Products Companies", "Other Industrial Products Companies"] },
            { name: "Specialized Engineering", industries: ["Electrodes & Refractories Companies", "Abrasives & Bearings Companies"] },
            { name: "Welding & Cryogenics", industries: ["Industrial Gases Companies"], symbols: ["ESABINDIA", "ADORWELD"] },
            { name: "Construction & Earthmoving", industries: ["Construction Vehicles Companies"] }
        ]
    },
    {
        title: "POWER INFRA & ELECTRICALS",
        themes: [
            { name: "Cables & Electricals", industries: ["Cables - Electricals Companies"], symbols: ["POLYCAB", "KEI", "FINPIPE"] },
            { name: "Smart Metering & Inst.", industries: ["Other Electrical Equipment Companies"], symbols: ["HPL", "GENUSPOWER"] },
            { name: "Transformers & Switchgears", industries: ["Heavy Electrical Equipment Companies"], symbols: ["TRITURBINE”, “VOLTAMP", "GEPIL"] },
            { name: "EPC - Power & Grid", industries: ["Engineering Services Companies"], symbols: ["KPTL", "TECHNOE"] }
        ]
    },
    {
        title: "DEFENSE & AEROSPACE SYSTEMS",
        themes: [
            { name: "Aerospace & Defense OEM", industries: ["Aerospace & Defense Companies"], symbols: ["HAL", "BEL"] },
            { name: "Ship Building (Defense)", industries: ["Ship Building & Allied Services Companies"], symbols: ["MAZDOCK", "COCHINSHIP", "GRSE"] },
            { name: "Defense Electronics & Systems", industries: ["Aerospace & Defense Companies"], symbols: ["DATA PATT", "ASTRAZEN", "BEL"] },
            { name: "Ammunition & Explosives", industries: ["Explosives Companies"], symbols: ["SOLARINDS"] },
            { name: "Defense Misc / Land Systems", industries: ["Other Construction Materials Companies", "Tractors Companies"], symbols: ["BEML"] },
            { name: "Railway Systems & Rolling Stock", industries: ["Railway Wagons Companies"], symbols: ["TITAGARH", "TEXRAIL", "JWL", "BEML"] },
            { name: "EMS - Electronics", industries: ["Industrial Products Companies"], symbols: ["KAYNES", "SYRMA", "AVALON"] }
        ]
    },
    {
        title: "METALS & MINING",
        themes: [
            { name: "Non-Ferrous Metals", industries: ["Aluminium Companies", "Copper Companies", "Zinc Companies", "Aluminium, Copper & Zinc Products Companies", "Precious Metals Companies"] },
            { name: "Iron & Steel Core", industries: ["Iron & Steel Companies"] },
            { name: "Iron & Steel Products", industries: ["Iron & Steel Products Companies"] },
            { name: "Coal & Mining", industries: ["Coal Companies", "Trading - Coal Companies"] },
            { name: "Sponge & Ferro Alloys", industries: ["Sponge Iron Companies", "Ferro & Silica Manganese Companies"] },
            { name: "Metal Recycling", industries: ["Industrial Minerals Companies"], symbols: ["GRAVITA"] },
            { name: "Industrial Minerals", industries: ["Industrial Minerals Companies"] }
        ]
    },
    {
        title: "ENERGY, OIL & GAS",
        themes: [
            { name: "Oil Exploration (E&P)", industries: ["Oil Exploration & Production Companies"] },
            { name: "Integrated Utilities", industries: ["Integrated Power Utilities Companies"] },
            { name: "Power Transmission", industries: ["Power - Transmission Companies"] },
            { name: "Power Generation", industries: ["Power Generation Companies"] },
            { name: "Gas Utilities", industries: ["Gas Transmission/Marketing Companies", "LPG/CNG/PNG/LNG Supplier Companies", "Trading - Gas Companies"] },
            { name: "Refineries & Mktg", industries: ["Refineries & Marketing Companies"] },
            { name: "Solar & Renewables", industries: ["Other Utilities Companies"], symbols: ["BORORENEW", "KPIGREEN", "SWSOLAR"] },
            { name: "Oil Equip & Offshore", industries: ["Oil Equipment & Services Companies", "Offshore Support Solution Drilling Companies", "Oil Storage & Transportation Companies"] },
            { name: "Lubricants & Specialty Oils", industries: ["Lubricants Companies"] },
            { name: "Power Trading", industries: ["Power Trading Companies", "Trading - Electricity Companies"] }
        ]
    },
    {
        title: "Lifestyle & Retail",
        themes: [
            { name: "Leather Products", industries: ["Leather And Leather Products Companies"] },
            { name: "Gems & Jewellery", industries: ["Gems, Jewellery And Watches Companies"] },
            { name: "Fashion & Garments", industries: ["Garments & Apparels Companies", "Trading - Textile Products Companies", "Other Textile Products Companies"] },
            { name: "Footwear", industries: ["Footwear Companies"] },
            { name: "Specialty Retail", industries: ["Speciality Retail Companies", "Pharmacy Retail Companies", "Diversified Retail Companies"] },
            { name: "E-Retail & E-Commerce", industries: ["E-Retail/ E-Commerce Companies", "Internet & Catalogue Retail Companies"] },
            { name: "Jute & Fiber Products", industries: ["Jute & Jute Products Companies"] }
        ]
    },
    {
        title: "Consumer Durables",
        themes: [
            { name: "Consumer Electronics", industries: ["Consumer Electronics Companies"] },
            { name: "Household White Goods", industries: ["Household Appliances Companies"] },
            { name: "HVAC & Cooling", industries: ["Other Electrical Equipment Companies"], symbols: ["VOLTAS", "BLUESTARCO", "JOHNSONCNTL", "AMBER"] },
            { name: "Furniture & Decor", industries: ["Furniture, Home Furnishing Companies"] },
            { name: "Cons. Plastic Products", industries: ["Plastic Products - Consumer Companies"] },
            { name: "Houseware & Glass", industries: ["Houseware Companies", "Glass - Consumer Companies"] }
        ]
    },
    {
        title: "Media & Leisure",
        themes: [
            { name: "Media & Ent.", industries: ["Media & Entertainment Companies", "Electronic Media Companies"] },
            { name: "Advertising & Agencies", industries: ["Advertising & Media Agencies Companies"] },
            { name: "Amusement Parks", industries: ["Amusement Parks/ Other Recreation Companies"] },
            { name: "Broadcast & Print", industries: ["TV Broadcasting & Software Production Companies", "Print Media Companies", "Film Production, Distribution & Exhibition Companies"] },
            { name: "Events & Weddings", industries: ["Other Consumer Services Companies"] },
            { name: "Digital Entertainment", industries: ["Digital Entertainment Companies"] },
            { name: "Print & Publication", industries: ["Printing & Publication Companies", "Print Media Companies"] }
        ]
    },
    {
        title: "PROFESSIONAL SERVICES",
        themes: [
            { name: "Education & EdTech", industries: ["Education Companies", "E-Learning Companies"] },
            { name: "Stationery & Paper", industries: ["Paper & Paper Products Companies", "Stationary Companies"] },
            { name: "Business Services", industries: ["Diversified Commercial Services Companies", "Consulting Services Companies"] }
        ]
    },
    {
        title: "FMCG",
        themes: [
            { name: "Personal Care", industries: ["Personal Care Companies", "Wellness Companies"] },
            { name: "Diversified FMCG", industries: ["Diversified FMCG Companies"] },
            { name: "FMCG Packaging", industries: ["Packaging Companies"] },
            { name: "Cigarettes & Tobacco", industries: ["Cigarettes & Tobacco Products Companies"] },
            { name: "Household Products", industries: ["Household Products Companies"] }
        ]
    },
    {
        title: "Food & Beverages",
        themes: [
            { name: "Tea & Coffee", industries: ["Tea & Coffee Companies"] },
            { name: "Sugar & Ethanol", industries: ["Sugar Companies"] },
            { name: "Dairy & Milk Products", industries: ["Dairy Products Companies"] },
            { name: "Edible Oil", industries: ["Edible Oil Companies"] },
            { name: "Packaged & Processed Foods", industries: ["Packaged Foods Companies", "Other Food Products Companies"] },
            { name: "Alcoholic Beverages", industries: ["Breweries & Distilleries Companies", "Other Beverages Companies"] }
        ]
    },
    {
        title: "TRAVEL & HOSPITALITY",
        themes: [
            { name: "Premium Hotels & Resorts", industries: ["Hotels & Resorts Companies"] },
            { name: "Tour & Travel Services", industries: ["Tour, Travel Related Services Companies"] },
            { name: "Aviation & Airlines", industries: ["Airline Companies"] },
            { name: "Quick Service Rest. (QSR)", industries: ["Restaurants Companies"] },
            { name: "Leisure & Amusement", industries: ["Amusement Parks/ Other Recreation Companies", "Leisure Products Companies"] }
        ]
    },
    {
        title: "Agri Business",
        themes: [
            { name: "Seafood & Meat", industries: ["Seafood Companies", "Meat Products including Poultry Companies"] },
            { name: "Rice & Grain Processing", industries: ["Other Agricultural Products Companies"] },
            { name: "Fertilizers", industries: ["Fertilizers Companies"] },
            { name: "Agrochemicals", industries: ["Pesticides & Agrochemicals Companies"] },
            { name: "Animal Feed & Seeds", industries: ["Animal Feed Companies"] }
        ]
    },
    {
        title: "Healthcare Segments",
        themes: [
            { name: "Hospitals", industries: ["Hospital Companies", "Healthcare Service Provider Companies"] },
            { name: "Pharmaceuticals", industries: ["Pharmaceuticals Companies", "Biotechnology Companies"] },
            { name: "Research & CDMO", industries: ["Healthcare Research, Analytics & Technology Companies"] },
            { name: "Diagnostics & Labs", industries: ["Healthcare Service Provider Companies"], symbols: ["DRREDDY", "METROPOLIS"] },
            { name: "Equipment & Retail", industries: ["Medical Equipment & Supplies Companies", "Pharmacy Retail Companies"] }
        ]
    },
    {
        title: "Const. & Materials",
        themes: [
            { name: "Civil Construction", industries: ["Civil Construction Companies"] },
            { name: "Cement", industries: ["Cement & Cement Products Companies"] },
            { name: "Glass, Granite & Roof", industries: ["Granites & Marbles Companies", "Glass - Industrial Companies", "Ceramics Companies"] },
            { name: "Wood & Laminates", industries: ["Plywood Boards/ Laminates Companies", "Furniture, Home Furnishing Companies"] },
            { name: "PEB & Steel Structures", industries: ["Iron & Steel Products Companies"] },
            { name: "Plumbing & Piping", industries: ["Iron & Steel Products Companies", "Plastic Products - Industrial Companies"], symbols: ["APLAPOLLO", "SUPREMEIND", "ASTRAL", "PRINCEPIPE"] },
            { name: "Paints & Coatings", industries: ["Paints Companies"] },
            { name: "Sanitary Ware", industries: ["Sanitary Ware Companies"] }
        ]
    },
    {
        title: "Real Estate Segments",
        themes: [
            { name: "Residential Projects", industries: ["Residential, Commercial Projects Companies"] },
            { name: "Real Estate Services & Platforms", industries: ["Real Estate related services Companies"] },
            { name: "Property Allied Services", industries: ["Diversified Commercial Services Companies"] },
            { name: "Commercial & Diversified", industries: ["Residential, Commercial Projects Companies"], symbols: ["DLF", "PHOENIXLTD"] },
            { name: "REITs", industries: ["Real Estate Investment Trusts (REITs) Companies"] }
        ]
    },
    {
        title: "Logistics & Trans",
        themes: [
            { name: "Shipping", industries: ["Shipping Companies"] },
            { name: "Logistics Infra (Ports/Air)", industries: ["Port & Port services Companies", "Airport & Airport services Companies"] },
            { name: "Logistics Services (3PL)", industries: ["Logistics Solution Provider Companies", "Transport Related Services Companies"] },
            { name: "Road Assets (Tolls/HAM)", industries: ["Road AssetsToll, Annuity, Hybrid-Annuity Companies"] },
            { name: "Surface Transport", industries: ["Road Transport Companies", "Transport Related Services Companies"] }
        ]
    },
    {
        title: "Env & Sustainability",
        themes: [
            { name: "Environmental Eng.", industries: ["Engineering Services Companies"] },
            { name: "Waste Management", industries: ["Waste Management Companies"] },
            { name: "Water & Effluent Mgmt", industries: ["Water Supply & Management Companies", "Other Utilities Companies"], symbols: ["IONEXCHANG", "VA TECH WABAG"] }
        ]
    },

    {
        title: "DATA CENTER ECOSYSTEM",
        themes: [
            { name: "Power Grid & Distribution", industries: ["Power Distribution Companies", "Power - Transmission Companies"], symbols: ["POWERGRID", "RECLTD", "PFC"] },
            { name: "Cooling & DC HVAC", industries: ["Other Electrical Equipment Companies"], symbols: ["BLUESTARCO", "VOLTAS", "SCHNEIDER"] },
            { name: "Hardware & Server Proxies", industries: ["IT Enabled Services Companies", "Heavy Electrical Equipment Companies"], symbols: ["NETWEB", "ABB", "SIEMENS"] },
            { name: "EPC / Buildout", industries: ["Civil Construction Companies"], symbols: ["LT"] }
        ]
    },
    {
        title: "DIVERSIFIED & TRADING",
        themes: [
            { name: "Diversified Conglomerates", industries: ["Diversified Companies"] },
            { name: "Commodity Trading", industries: ["Trading - Minerals Companies", "Trading - Metals Companies", "Trading - Chemicals Companies"] },
            { name: "General Trading & Dist.", industries: ["Trading & Distributors Companies", "Distributors Companies"] }
        ]
    }
];

export const MACRO_PILLARS = [
    {
        title: "I. FINANCIAL BACKBONE",
        blocks: ["BANKING & FINANCIAL SERVICES", "PROFESSIONAL SERVICES"]
    },
    {
        title: "II. INDUSTRIAL & DEFENSE ALPHA",
        blocks: ["AUTOMOTIVE (STOCKS)", "AUTOMOTIVE COMPONENTS", "ENGINEERING & MANUFACTURING", "DEFENSE & AEROSPACE SYSTEMS"]
    },
    {
        title: "III. DIGITAL ECONOMY & TECH",
        blocks: ["INFORMATION TECHNOLOGY & TECHNOLOGY", "DATA CENTER ECOSYSTEM", "POWER INFRA & ELECTRICALS"]
    },
    {
        title: "IV. CONSUMPTION & LIFESTYLE",
        blocks: ["FMCG", "Food & Beverages", "Lifestyle & Retail", "Consumer Durables", "Media & Leisure", "TRAVEL & HOSPITALITY", "Healthcare Segments"]
    },
    {
        title: "V. NATION BUILDING (INFRA/RE)",
        blocks: ["Const. & Materials", "Real Estate Segments", "Logistics & Trans", "Env & Sustainability"]
    },
    {
        title: "VI. COMMODITIES & RESOURCES",
        blocks: ["CHEMICALS SECTOR", "METALS & MINING", "ENERGY, OIL & GAS", "Agri Business", "DIVERSIFIED & TRADING"]
    }
];
