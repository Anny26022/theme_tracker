import requests
from bs4 import BeautifulSoup
import json
import time
import os
from collections import deque

# --- CONFIGURATION ---
BASE_URL = "https://www.screener.in"
START_URL = "https://www.screener.in/market/"
RAW_HIERARCHY_FILE = 'screener_full_hierarchy.json'
FINAL_MAPPING_FILE = 'company_industry_mapping.json'
EXTENDED_REPORT_FILE = 'company_all_categories.json'
CHECKPOINT_FILE = 'crawler_checkpoint.json'

# --- PHASE 1: CRAWLING ---

def get_soup(url):
    """Fetches and parses a URL with rate-limit handling."""
    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36'
    }
    retry_delay = 5
    max_retries = 3
    
    for attempt in range(max_retries):
        try:
            response = requests.get(url, headers=headers, timeout=20)
            if response.status_code == 200:
                return BeautifulSoup(response.text, 'html.parser')
            elif response.status_code == 429:
                print(f"  [!] Rate limited (429) on {url}. Waiting {retry_delay}s...")
                time.sleep(retry_delay)
                retry_delay *= 2
            else:
                print(f"  [!] Failed {url}: {response.status_code}")
                return None
        except Exception as e:
            print(f"  [!] Error: {e}")
            time.sleep(2)
    return None

def run_crawler():
    """Builds the full market hierarchy tree using BFS."""
    if os.path.exists(CHECKPOINT_FILE):
        with open(CHECKPOINT_FILE, 'r') as f:
            checkpoint = json.load(f)
            visited = set(checkpoint['visited'])
            queue = deque(checkpoint['queue'])
            all_data = checkpoint['all_data']
        print(f"> Resuming crawl. Visited: {len(visited)}, In Queue: {len(queue)}")
    else:
        visited = set()
        queue = deque([START_URL])
        all_data = {}
        print("> Starting fresh crawl...")

    try:
        while queue:
            url = queue.popleft()
            if url in visited: continue
            
            print(f"  [Scraping] {url} (Queue: {len(queue)})")
            soup = get_soup(url)
            if not soup: continue

            visited.add(url)
            
            # Extract info
            title_tag = soup.find('h1')
            title = title_tag.get_text(strip=True) if title_tag else "N/A"
            
            # Extract companies
            companies = []
            for a in soup.find_all('a', href=True):
                if a['href'].startswith('/company/'):
                    parts = a['href'].split('/')
                    if len(parts) >= 3:
                        symbol = parts[2]
                        name = a.get_text(strip=True)
                        if name and symbol:
                            companies.append({'name': name, 'symbol': symbol})
            
            # Remove duplicates on page
            unique_companies = []
            seen_comp = set()
            for c in companies:
                if c['symbol'] not in seen_comp:
                    seen_comp.add(c['symbol'])
                    unique_companies.append(c)

            # Find sub-links
            sub_links = []
            for a in soup.find_all('a', href=True):
                href = a['href']
                if href.startswith('/market/IN') and '?' not in href:
                    full_url = f"{BASE_URL}{href}" if href.startswith('/') else href
                    if full_url not in visited and full_url not in queue:
                        sub_links.append(full_url)
                        queue.append(full_url)

            all_data[url] = {
                'title': title,
                'companies': unique_companies,
                'sub_links': list(set(sub_links))
            }

            # Periodic checkpoint
            if len(visited) % 10 == 0:
                with open(CHECKPOINT_FILE, 'w') as f:
                    json.dump({'visited': list(visited), 'queue': list(queue), 'all_data': all_data}, f, indent=4)
            
            time.sleep(1.2)

    except KeyboardInterrupt:
        print("\n[!] Crawl interrupted. Progress saved.")
    
    with open(RAW_HIERARCHY_FILE, 'w') as f:
        json.dump(all_data, f, indent=4)
    
    if not queue and os.path.exists(CHECKPOINT_FILE):
        os.remove(CHECKPOINT_FILE)
    
    print(f"> Crawl complete. Raw data: {RAW_HIERARCHY_FILE}")
    return all_data

# --- PHASE 2: RESOLUTION ---

def resolve_data(raw_data=None):
    """Processes raw hierarchy into clean mappings and extended reports."""
    if raw_data is None:
        if not os.path.exists(RAW_HIERARCHY_FILE):
            print(f"[!] {RAW_HIERARCHY_FILE} not found. Run crawler first.")
            return
        with open(RAW_HIERARCHY_FILE, 'r') as f:
            raw_data = json.load(f)

    print("> Resolving company paths, sectors and multi-category mappings...")
    mapping = {}
    
    for url, info in raw_data.items():
        depth = url.count('/') - 4
        title = info['title']
        
        for company in info['companies']:
            symbol = company['symbol']
            
            if symbol not in mapping:
                mapping[symbol] = {
                    "symbol": symbol,
                    "name": company['name'],
                    "category_count": 0,
                    "all_categories": [],
                    "primary_industry": {"title": "", "url": "", "depth": -1},
                    "sector": {"title": "N/A", "url": ""}
                }
            
            mapping[symbol]["category_count"] += 1
            mapping[symbol]["all_categories"].append({
                "title": title,
                "url": url,
                "depth": depth
            })
            
            # Map Sector (Top Level)
            if depth == 1:
                mapping[symbol]["sector"] = {"title": title, "url": url}
            
            # Identify Primary Industry (The most specific/deepest level)
            if depth > mapping[symbol]["primary_industry"]["depth"]:
                mapping[symbol]["primary_industry"] = {
                    "title": title,
                    "url": url,
                    "depth": depth
                }

    # 1. Generate standard mapping file (company_industry_mapping.json)
    standard_output = []
    # 2. Generate extended report file (company_all_categories.json)
    extended_output = []

    for symbol, meta in mapping.items():
        sorted_cats = sorted(meta["all_categories"], key=lambda x: x["depth"])
        
        # Standard format
        standard_output.append({
            "symbol": symbol,
            "name": meta["name"],
            "sector": meta["sector"]["title"],
            "industry": meta["primary_industry"]["title"],
            "path": " > ".join([x["title"] for x in sorted_cats])
        })
        
        # Extended format
        extended_output.append({
            "symbol": symbol,
            "name": meta["name"],
            "category_count": meta["category_count"],
            "sector": meta["sector"]["title"],
            "industry": meta["primary_industry"]["title"],
            "levels": [c["title"] for c in sorted_cats],
            "urls": [c["url"] for c in sorted_cats]
        })
    
    # Sort lists to keep similar industries together
    standard_output = sorted(standard_output, key=lambda x: (x["sector"], x["industry"], x["name"]))
    extended_output = sorted(extended_output, key=lambda x: (x["sector"], x["industry"], x["name"]))
    
    # Save files
    with open(FINAL_MAPPING_FILE, 'w') as f:
        json.dump(standard_output, f, indent=4)
    
    with open(EXTENDED_REPORT_FILE, 'w') as f:
        json.dump(extended_output, f, indent=4)
    
    print(f"> Mapping complete. Results sorted by Sector/Industry.")
    print(f"  - Final Mapping: {FINAL_MAPPING_FILE}")
    print(f"  - Extended Report: {EXTENDED_REPORT_FILE}")
    print(f"  - Unique Companies: {len(mapping)}")

# --- MAIN EXECUTION ---

if __name__ == "__main__":
    print("=== SCREENER.IN COMPLETE DATA TOOL ===")
    
    # 1. Run the crawler (or use existing raw data)
    if os.path.exists(RAW_HIERARCHY_FILE):
        choice = input(f"Found existing raw data ({RAW_HIERARCHY_FILE}). Re-scrape? (y/n): ").lower()
        if choice == 'y':
            data = run_crawler()
        else:
            with open(RAW_HIERARCHY_FILE, 'r') as f:
                data = json.load(f)
    else:
        data = run_crawler()
    
    # 2. Resolve the data into the final mapping and reports
    resolve_data(data)
    
    print("\n[Done] Processing finished successfully.")
