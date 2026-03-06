export const THEMATIC_MAP = [
    {
        title: "BANKING & FINANCIAL SERVICES",
        themes: [
            { name: "Public Sector Bank", industries: ["Public Sector Bank Companies"] },
            { name: "Exchanges & Platforms", industries: ["Exchange and Data Platform Companies"], symbols: ["BSE", "MCX", "IEX"] },
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
            { name: "Personal & Gold Loans", symbols: ["MUTHOOTFIN", "MANAPPURAM"] },
            { name: "Small Finance Bank", industries: ["Other Bank Companies"], symbols: ["AUFIL", "EQUITASBNK", "UJJIVANSFB"] },
            { name: "Capital Market Intern.", industries: ["Other Capital Market related Services Companies", "Stockbroking & Allied Companies", "Data Processing Services Companies"] },
            { name: "Depositories & Clearing", industries: ["Depositories, Clearing Houses and Other Intermediaries Companies"], symbols: ["CDSL", "544467"] },
            { name: "Market Infrastructure", symbols: ["CAMS", "KFINTECH"] },
            { name: "Fintech", industries: ["Financial Technology (Fintech) Companies"], symbols: ["PAYTM", "PBSTECH", "INFIBEAM"] },
            { name: "Financial Institutions", industries: ["Financial Institution Companies"] },
            { name: "Financial Distributors", industries: ["Financial Products Distributor Companies", "Insurance Distributors Companies"] }
        ]
    },
    {
        title: "AUTOMOTIVE (STOCKS)",
        themes: [
            { name: "Commercial Vehicles", industries: ["Commercial Vehicles Companies"] },
            { name: "2/3 Wheelers", industries: ["2/3 Wheelers Companies", "Cycles Companies"] },
            { name: "Tractors & Agri", industries: ["Tractors Companies"] },
            { name: "Auto Dealers & Retail", industries: ["Auto Dealer Companies", "Dealers-Commercial Vehicles, Tractors, Construction Vehicles Companies"] },
            { name: "Passenger Cars", industries: ["Passenger Cars & Utility Vehicles Companies"] }
        ]
    },
    {
        title: "AUTOMOTIVE COMPONENTS",
        themes: [
            { name: "Electronics & Systems", symbols: ["UNOMINDA", "MINDACORP", "SUBROS", "PRICOL", "BOSCHLTD"] },
            { name: "Drivetrain & Axles", symbols: ["SONACOMS", "ZFCVINDIA", "GNA"] },
            { name: "Chassis & Metal Parts", industries: ["Auto Components & Equipments Companies", "Castings & Forgings Companies", "Trading - Auto components Companies"], symbols: ["BHARATFORG", "CIEINDIA", "TIINDIA", "CRAFTSMAN", "RKFORGE", "SANSERA"] },
            { name: "Suspension & Safety", symbols: ["GABRIEL", "ENDURANCE", "LUMAXIND"] },
            { name: "Interior & Plastics", symbols: ["MOTHERSON", "LUMAXTECH", "VARROC"] },
            { name: "Engines & Cooling/Seal", industries: ["Compressors, Pumps & Diesel Engines Companies"], symbols: ["SRENGINE", "SHRIRAMPIS", "TALBROS", "IOLSYS", "SHRIPISTON"] },
            { name: "Wiring & Cables", symbols: ["MSUMI"] },
            { name: "Tyres & Wheels", industries: ["Tyres & Rubber Products Companies"], symbols: ["GOODYEAR", "ITTL", "MRF", "APOLLOTYRE", "CEATTD", "JKTYRE", "BALKRISIND", "TVS-SRICHAK", "GOODYEAR", "VIAZTYRES", "TOLINS"] },
            { name: "Batteries & EV", symbols: ["EXIDEIND", "AMARAJABAT"] }
        ]
    },
    {
        title: "INDUSTRIAL COMPONENTRY",
        themes: [
            { name: "Bearings & Precision", industries: ["Abrasives & Bearings Companies"] },
            { name: "Castings & Forgings", industries: ["Castings & Forgings Companies", "Pig Iron Companies"] },
            { name: "Industrial Products", industries: ["Industrial Products Companies", "Other Industrial Products Companies"] },
            { name: "Industrial Rubber", industries: ["Rubber Companies"] }
        ]
    },
    {
        title: "INFORMATION TECHNOLOGY & TECHNOLOGY",
        themes: [
            { name: "IT Services (Consulting)", industries: ["Computers - Software & Consulting Companies"] },
            { name: "IT Enabled Services (BPM)", industries: ["IT Enabled Services Companies"] },
            { name: "ER&D / Product Software", symbols: ["LTTS", "TATAELXSI", "CYIENT", "KPITTECH", "MOSCHIP"] },
            { name: "Enterprise Platforms", industries: ["Software Products Companies", "Computers Hardware & Equipments Companies"] },
            { name: "Telecom Operators", industries: ["Telecom - Cellular & Fixed line services Companies"], symbols: ["BHARTIARTL", "IDEA", "BHARTIHEXA"] },
            { name: "Telecom & Network Infra", industries: ["Telecom - Infrastructure Companies", "Telecom - Equipment & Accessories Companies", "Telecom -  Equipment & Accessories Companies", "Other Telecom Services Companies"], symbols: ["INDUSTOWER", "RAILTEL", "HFCL", "STLTECH", "TEJASNET", "DLINKINDIA"] },
            { name: "FoodTech & Q-Commerce", symbols: ["ETERNAL", "SWIGGY"] },
            { name: "Consumer E-Retail", industries: ["E-Retail/ E-Commerce Companies"], symbols: ["NYKAA", "MEESHO", "FIRSTCRY", "URBANCO", "WOMANCART"] },
            { name: "Logistics Tech", symbols: ["DELHIVERY"] },
            { name: "Recruitment & Classifieds", industries: ["Internet & Catalogue Retail Companies"], symbols: ["NAUKRI", "JUSTDIAL", "MATRIMONY"] },
            { name: "B2B Marketplaces", symbols: ["INDIAMART", "INDMART"] },
            { name: "AI Infra & GPU Cloud", symbols: ["NETWEB", "E2E"] },
            { name: "Vertical & Geospatial SaaS", symbols: ["RATEGAIN", "CEINFO", "MAPMYINDIA"] },
            { name: "E-Learning / EdTech", industries: ["E-Learning Companies"] },
            { name: "Digital Services & BPO", industries: ["Business Process Outsourcing (BPO)/ Knowledge Process Outsourcing (KPO) Companies"] },
            { name: "Web Content & Connectivity", industries: ["Web based media and service Companies"] }
        ]
    },
    {
        title: "CHEMICALS & POLYMERS",
        themes: [
            { name: "Speciality Chemicals", industries: ["Specialty Chemicals Companies", "Biotechnology Companies"] },
            { name: "Alkali Chemicals", industries: ["Commodity Chemicals Companies"], symbols: ["TATACHEM", "GHCL", "GUJALKALI", "DCW", "DCMSHRIRAM"] },
            { name: "Dyes & Pigments", industries: ["Dyes And Pigments Companies"], symbols: ["BODALCHEM", "KIRIINDUS", "SUDARSCHEM"] },
            { name: "Polymers", industries: ["Petrochemicals Companies"], symbols: ["RELIANCE", "GAIL", "SUPREMEIND", "FINPIPE", "ASTRAL"] },
            { name: "Agro Chemicals", industries: ["Pesticides & Agrochemicals Companies"], symbols: ["UPL", "PIIND", "SUMICHEM", "DHANUKA"] },
            { name: "Carbon Black", industries: ["Carbon Black Companies"] }
        ]
    },
    {
        title: "ENGINEERING & MANUFACTURING",
        themes: [
            { name: "Heavy Electrical Equip", symbols: ["BHEL", "ENRIN", "AZAD", "ELECON", "GVPIL", "INOXWIND", "TDPOWERSYS", "THERMAX", "SKIPPER", "TRANSRAILL", "TARIL", "BAJEL", "544150", "ATLANTAELE"] },
            { name: "Refractories", industries: ["Electrodes & Refractories Companies"], symbols: ["RHIM", "ORIENTREF", "IFGL"] },
            { name: "Welding & Cryogenics", industries: ["Industrial Gases Companies"], symbols: ["ESABINDIA", "ADORWELD"] },
            { name: "Material Handling & Storage", industries: ["Food Storage Facilities Companies"], symbols: ["ACTIONCONST", "ELGI EQUIP"] },
            { name: "Construction & Earthmoving", industries: ["Construction Vehicles Companies"] }
        ]
    },
    {
        title: "POWER INFRA & ELECTRICALS",
        themes: [
            { name: "Cables & Electricals", industries: ["Cables - Electricals Companies"], symbols: ["POLYCAB", "KEI", "FINPIPE"] },
            { name: "Smart Metering & Inst.", symbols: ["HPL", "GENUSPOWER", "RISHABH", "SALZERELEC", "BBL", "RAMRAT", "SHILCTECH", "DIACABS", "515008", "544310", "APARINDS", "RELTD", "517467", "517035"] },
            { name: "Transformers & Switchgears", symbols: ["ABB", "CGPOWER", "GVT&D", "POWERINDIA", "SIEMENS", "SCHNEIDER", "INDOTECH", "VOLTAMP", "QPOWER", "TRITURBINE", "GEPIL"] },
            { name: "EPC - Power & Grid", industries: ["Engineering Services Companies", "Multi Utilities Companies", "Other Construction Materials Companies"], symbols: ["KPTL", "TECHNOE", "544291"] }
        ]
    },
    {
        title: "DEFENSE & AEROSPACE SYSTEMS",
        themes: [
            { name: "Aerospace & Defense OEM", industries: ["Aerospace & Defense Companies"], symbols: ["HAL", "BEL", "BDL", "MIDHANI", "IDEAFORGE", "UNIMECH", "AEQUS", "MTARTECH", "543920", "522229", "523606", "JAYKAY"] },
            { name: "Railways", industries: ["Railway Wagons Companies"], symbols: ["TITAGARH", "TEXRAIL", "JWL", "BEML", "IRFC", "RVNL", "IRCON"] },
            { name: "Ship Building & Marine", industries: ["Ship Building & Allied Services Companies"], symbols: ["MAZDOCK", "COCHINSHIP", "GRSE", "DREDGECORP", "KMEW"] },
            { name: "Ammunition & Explosives", industries: ["Explosives Companies"], symbols: ["SOLARINDS", "PREMEXPLN", "GOCLCORP"] },
            { name: "EMS - Electronics", symbols: ["KAYNES", "SYRMA", "AVALON"] }
        ]
    },
    {
        title: "METALS & MINING",
        themes: [
            { name: "Diversified Metals (VEDL)", industries: ["Diversified Metals Companies"], symbols: ["VEDL"] },
            { name: "Aluminium & Base Metals", industries: ["Aluminium Companies", "Zinc Companies"], symbols: ["HINDALCO", "HINDZINC", "NATIONALUM"] },
            { name: "Copper & Specialty Metallurgy", industries: ["Copper Companies", "Aluminium, Copper & Zinc Products Companies", "Precious Metals Companies"], symbols: ["HINDCOPPER", "PRECISION", "RAMRAT"] },
            { name: "Iron & Steel Core", industries: ["Iron & Steel Companies"], symbols: ["TATASTEEL", "JSWSTEEL", "SAIL", "JINDALSTEL"] },
            { name: "Iron & Steel Products", industries: ["Iron & Steel Products Companies"], symbols: ["APLAPOLLO", "RATNAMANI"] },
            { name: "Coal & Mining", industries: ["Coal Companies", "Trading - Coal Companies"], symbols: ["COALINDIA", "NMDC"] },
            { name: "Sponge & Ferro Alloys", industries: ["Sponge Iron Companies", "Ferro & Silica Manganese Companies"] },
            { name: "Industrial Minerals", industries: ["Industrial Minerals Companies"] }
        ]
    },
    {
        title: "ENERGY, OIL & GAS",
        themes: [
            { name: "Upstream", industries: ["Oil Exploration & Production Companies"], symbols: ["ONGC", "OIL"] },
            { name: "Integrated Utilities", industries: ["Integrated Power Utilities Companies"] },
            { name: "Power Transmission", industries: ["Power - Transmission Companies"] },
            { name: "Power Generation", industries: ["Power Generation Companies"] },
            { name: "Gas Utilities", industries: ["Gas Transmission/Marketing Companies", "LPG/CNG/PNG/LNG Supplier Companies", "Trading - Gas Companies"] },
            { name: "Oil Refiners", industries: ["Refineries & Marketing Companies"], symbols: ["BPCL", "HPCL", "IOC", "MRPL", "CHENNPETRO"] },
            { name: "Energy Conglomerate", symbols: ["RELIANCE", "ADANIENT"] },
            { name: "Solar & Renewables", industries: ["Other Utilities Companies"], symbols: ["BORORENEW", "KPIGREEN", "SWSOLAR", "IREDA", "SUZLON", "ADANIGREEN", "JSWENERGY", "WAAREEENER", "PREMIERENE", "ALPEXSOLAR", "VIKRAMSOLR", "WEBELSOLAR", "SAATVIKGL", "EMMVEE", "UTLSOLAR", "ORIANA", "SERVOTECH", "WAAREERTL"] },
            { name: "Smart Energy Storage", symbols: ["EXIDEIND", "AMARAJABAT", "ARE&M"] },
            { name: "Oil Equip & Offshore", industries: ["Oil Equipment & Services Companies", "Offshore Support Solution Drilling Companies", "Oil Storage & Transportation Companies"] },
            { name: "Lubricants & Specialty Oils", industries: ["Lubricants Companies"], symbols: ["GULFOILLUB", "CASTROLIND", "TIDEWATER"] },
            { name: "Power Trading", industries: ["Power Trading Companies", "Trading - Electricity Companies"], symbols: ["IEX"] }
        ]
    },
    {
        title: "Lifestyle & Retail",
        themes: [
            { name: "Innerwear Manufacturers", symbols: ["PAGEIND", "LUXIND", "RUPA", "DOLLAR"] },
            { name: "Jewellery", industries: ["Gems, Jewellery And Watches Companies"], symbols: ["TITAN", "KALYANKJIL", "RAJESHEXPO"] },
            { name: "Premium & Branded Apparel", industries: ["Garments & Apparels Companies"], symbols: ["ABFRL", "RAYMOND"] },
            { name: "Home Textiles & Furnish", industries: ["Other Textile Products Companies", "Jute & Jute Products Companies"], symbols: ["WELSPUNLIV", "TRIDENT"] },
            { name: "Spinning & Yarn Processing", symbols: ["VARDHACRL", "KPRMILL", "VTL", "NITINSPIN", "SANGAMIND", "FILATEX", "SPORTKING", "AYMSYNTEX"] },
            { name: "Footwear & Leather", industries: ["Footwear Companies", "Leather And Leather Products Companies"], symbols: ["RELAXO", "BATAINDIA", "CAMPUS", "METROBRAND", "MIRZAINT", "MAYURUNIQ"] },
            { name: "Apparel Retail Chains", industries: ["Speciality Retail Companies", "Trading - Textile Products Companies"], symbols: ["ABFRL", "V2RETAIL", "GOKEX", "TCNSBRANDS", "ETHOSLTD"] },
            { name: "Hypermarkets & Dept. Stores", industries: ["Diversified Retail Companies"], symbols: ["TRENT", "DMART", "WESTLIFE"] },
            { name: "Heath & Pharma Retail", industries: ["Pharmacy Retail Companies"], symbols: ["MEDPLUS"] }
        ]
    },
    {
        title: "Consumer Durables",
        themes: [
            { name: "Consumer Electronics", industries: ["Consumer Electronics Companies"], symbols: ["543597"] },
            { name: "Household White Goods", industries: ["Household Appliances Companies"] },
            { name: "HVAC & Cooling", symbols: ["VOLTAS", "JOHNSONCNTL", "AMBER"] },
            { name: "Furniture & Decor", industries: ["Furniture, Home Furnishing Companies"] },
            { name: "Cons. Plastic Products", industries: ["Plastic Products - Consumer Companies"] },
            { name: "Houseware & Glass", industries: ["Houseware Companies", "Glass - Consumer Companies", "Glass - Industrial Companies"], symbols: ["YASHOPTICS", "523558"] }
        ]
    },
    {
        title: "Media & Leisure",
        themes: [
            { name: "Media & Entertainment", industries: ["Media & Entertainment Companies", "Electronic Media Companies"] },
            { name: "Advertising & Agencies", industries: ["Advertising & Media Agencies Companies"] },
            { name: "Amusement Parks", symbols: ["WONDERLA", "IMAGICAA", "DELTACORP", "526721", "526477", "526628", "538731"] },
            { name: "Electronic Media & News", industries: ["TV Broadcasting & Software Production Companies", "Electronic Media Companies"], symbols: ["SUNTV", "ZEEL", "NDTV"] },
            { name: "Print & Publication", industries: ["Print Media Companies", "Printing & Publication Companies"], symbols: ["DBCORP", "JAGRAN"] },
            { name: "Film Production & Exhibition", industries: ["Film Production, Distribution & Exhibition Companies"], symbols: ["PVRINOX"] },
            { name: "Events & Weddings", industries: ["Other Consumer Services Companies"] },
            { name: "Digital Entertainment", industries: ["Digital Entertainment Companies"] }
        ]
    },
    {
        title: "PROFESSIONAL SERVICES",
        themes: [
            { name: "Education & EdTech", industries: ["Education Companies"] },
            { name: "Stationery & Paper", industries: ["Paper & Paper Products Companies", "Stationary Companies"] },
            { name: "HR, Staffing & Training", industries: ["Consulting Services Companies"], symbols: ["QUESS", "TEAMLEASE", "KAPSTON", "ADITIFG", "KRYSTAL"] },
            { name: "BPO & Specialized Services", industries: ["Diversified Commercial Services Companies"], symbols: ["BLSE", "CMSINFO", "UDS", "SANGHVIMOV"] }
        ]
    },
    {
        title: "FMCG CLUSTERS",
        themes: [
            { name: "Household & Personal Care", industries: ["Personal Care Companies", "Household Products Companies", "Wellness Companies"], symbols: ["HINDUNILVR", "GODREJCP", "DABUR", "JYOTHYLAB", "KAYA"] },
            { name: "Packaged Diversified FMCG", industries: ["Diversified FMCG Companies"], symbols: ["ITC", "NESTLEIND", "BRITANNIA", "TATACONSUM"] },
            { name: "Packaging and Containers", industries: ["Packaging Companies", "Printing Inks Companies"], symbols: ["HUHTAMAKI", "ESSELPRO", "POLYPLEX"] },
            { name: "Packaging Films", symbols: ["COSMOFIRST", "JINDALPOLY", "GARFIBRES"] },
            { name: "Cigarettes & Tobacco", industries: ["Cigarettes & Tobacco Products Companies"], symbols: ["ITC", "VSTIND", "GODFRYPHLP"] }
        ]
    },
    {
        title: "Food & Beverages",
        themes: [
            { name: "Tea & Coffee", industries: ["Tea & Coffee Companies"] },
            { name: "Sugar", industries: ["Sugar Companies"] },
            { name: "Dairy & Milk Products", industries: ["Dairy Products Companies"] },
            { name: "Edible Oil", industries: ["Edible Oil Companies"] },
            { name: "Packaged Meat", symbols: ["VENKEYS", "SKMEGG", "HMAAGRO", "544568", "530741", "519566", "SKMEGGPROD"] },
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
            { name: "Leisure & Amusement", industries: ["Leisure Products Companies"] }
        ]
    },
    {
        title: "Agri Business",
        themes: [
            { name: "Seafood & Meat", industries: ["Seafood Companies"] },
            { name: "Rice & Grain Processing", industries: ["Other Agricultural Products Companies"] },
            { name: "Fertilizers", industries: ["Fertilizers Companies"] },
            { name: "Crop Protection", symbols: ["RALLIS", "INSECTICID", "SHARDACROP", "HERANBA"] },
            { name: "Animal Feed & Seeds", industries: ["Animal Feed Companies"] }
        ]
    },
    {
        title: "Healthcare Segments",
        themes: [
            { name: "Hospitals", industries: ["Hospital Companies", "Healthcare Service Provider Companies"], symbols: ["APOLLOHOSP", "MAXHEALTH", "FORTIS", "NARAYANA", "MEDANTA"] },
            { name: "Pharma", industries: ["Pharmaceuticals Companies"], symbols: ["SUNPHARMA", "CIPLA", "DRREDDY", "DIVISLAB", "MANKIND"] },
            { name: "Pharma - API & CRAMS", industries: ["Healthcare Research, Analytics & Technology Companies"], symbols: ["DIVISLAB", "LAURUSLABS", "SYNGENE", "SOLARA", "NEULANDLAB", "INDGN", "VIMTALABS"] },
            { name: "Pharma - Small Cap", symbols: ["MARKSANS", "LINCOLN", "AARTIDRUGS", "GRANULES"] },
            { name: "Diagnostic & Lab Services", symbols: ["METROPOLIS", "LALPATHLAB", "VIJAYA", "THYROCARE", "KRSNAA"] },
            { name: "Specialized Equipment & Retail", industries: ["Medical Equipment & Supplies Companies"], symbols: ["POLYMED", "MEDPLUS"] }
        ]
    },
    {
        title: "Const. & Materials",
        themes: [
            { name: "Cement", industries: ["Cement & Cement Products Companies"], symbols: ["ULTRACEMCO", "SHREECEM", "AMBUJACEM", "ACC", "DALBHARAT"] },
            { name: "Tiles", industries: ["Ceramics Companies", "Granites & Marbles Companies", "Sanitary Ware Companies"], symbols: ["KAJARIACER", "SOMANYCERA", "CERA", "HINDWAREAP", "AROGRANITE", "POKARNA"] },
            { name: "Wood & Plywood", industries: ["Plywood Boards/ Laminates Companies", "Forest Products Companies"], symbols: ["CENTURYPLY", "GREENPLY", "GREENPANEL"] },
            { name: "Paint Manufacturers", industries: ["Paints Companies"], symbols: ["ASIANPAINT", "BERGEPAINT", "KANSAINER", "INDIGOPNTS"] },
            { name: "Plastic Pipes", industries: ["Plastic Products - Industrial Companies"], symbols: ["ASTRAL", "SUPREMEIND", "PRINCEPIPE", "FINPIPE", "APOLLOPIPE", "TIMETECHNO"] },
            { name: "Metal Pipes", symbols: ["APLAPOLLO", "RATNAMANI", "JINDALSAW"] }
        ]
    },
    {
        title: "Real Estate Segments",
        themes: [
            { name: "Residential Projects", symbols: ["LODHA", "GODREJPROP", "PRESTIGE", "SOBHA", "KOLTEPATIL", "PURVA", "ASHIANA", "SIGNATURE", "RUSTOMJEE", "MAHLIFE", "OBEROIRLTY", "SUNTECK", "TARC", "LOTUSDEV", "GANESHHOU", "KALPATARU", "543542", "AGIIL"] },
            { name: "Real Estate Services & Platforms", industries: ["Real Estate related services Companies"] },
            { name: "Property Allied Services", symbols: ["AWFIS", "SMARTWORKS", "WEWORK", "HEMIPROP", "INDIQUBE", "NESCO", "NDRINVIT", "TVSINVIT"] },
            { name: "Commercial & Diversified", symbols: ["DLF", "PHOENIXLTD", "BRIGADE", "ANANTRAJ", "EMBDL", "HUBTOWN", "MAXESTATES"] },
            { name: "REITs", industries: ["Real Estate Investment Trusts (REITs) Companies"] }
        ]
    },
    {
        title: "Logistics & Trans",
        themes: [
            { name: "Shipping", industries: ["Shipping Companies"] },
            { name: "Logistics Infra (Ports/Air)", industries: ["Port & Port services Companies", "Airport & Airport services Companies", "Dredging Companies"] },
            { name: "Logistics", industries: ["Logistics Solution Provider Companies", "Transport Related Services Companies"] },
            { name: "Road Assets (Tolls/HAM)", industries: ["Road AssetsToll, Annuity, Hybrid-Annuity Companies"] },
            { name: "Surface Transport", industries: ["Road Transport Companies", "Transport Related Services Companies"] }
        ]
    },
    {
        title: "Env & Sustainability",
        themes: [
            { name: "Waste Management", industries: ["Waste Management Companies"] },
            { name: "Water & Effluent Mgmt", industries: ["Water Supply & Management Companies", "Other Utilities Companies"], symbols: ["IONEXCHANG", "VA TECH WABAG"] }
        ]
    },

    {
        title: "DATA CENTER ECOSYSTEM",
        themes: [
            { name: "Power Grid & Distribution", industries: ["Power Distribution Companies"], symbols: ["POWERGRID", "RECLTD", "PFC"] },
            { name: "EPC / Buildout", industries: ["Civil Construction Companies"], symbols: ["LT"] }
        ]
    },
    {
        title: "DIVERSIFIED & TRADING",
        themes: [
            { name: "Diversified Conglomerates", industries: ["Diversified Companies"], symbols: ["RELIANCE", "ADANIENT", "ITC", "GRASIM"] },
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
        blocks: ["AUTOMOTIVE (STOCKS)", "AUTOMOTIVE COMPONENTS", "INDUSTRIAL COMPONENTRY", "ENGINEERING & MANUFACTURING", "DEFENSE & AEROSPACE SYSTEMS"]
    },
    {
        title: "III. DIGITAL ECONOMY & TECH",
        blocks: ["INFORMATION TECHNOLOGY & TECHNOLOGY", "DATA CENTER ECOSYSTEM", "POWER INFRA & ELECTRICALS"]
    },
    {
        title: "IV. CONSUMPTION & LIFESTYLE",
        blocks: ["FMCG CLUSTERS", "Food & Beverages", "Lifestyle & Retail", "Consumer Durables", "Media & Leisure", "TRAVEL & HOSPITALITY", "Healthcare Segments", "Agri Business"]
    },
    {
        title: "V. NATION BUILDING (INFRA/RE)",
        blocks: ["Const. & Materials", "Real Estate Segments", "Logistics & Trans", "Env & Sustainability"]
    },
    {
        title: "VI. COMMODITIES & RESOURCES",
        blocks: ["CHEMICALS & POLYMERS", "METALS & MINING", "ENERGY, OIL & GAS", "DIVERSIFIED & TRADING"]
    }
];
