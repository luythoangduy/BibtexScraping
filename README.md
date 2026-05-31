# BibtexScraping

Ung dung localhost giup doc danh sach ten bai bao tu file Excel, tim bai tren Google Scholar thong qua SerpApi, lay BibTeX va xuat lai ket qua thanh file `.xlsx`.

App phu hop khi ban co mot danh sach paper title va muon tu dong tao BibTeX hang loat. Neu ket qua Google Scholar khong khop gan voi ten bai bao dau vao, app se tra ve `warning` thay vi lay BibTeX de tranh nham bai.

## Tinh nang

- Upload file Excel `.xlsx` hoac `.xls`.
- Doc danh sach ten bai bao tu sheet dau tien.
- Goi SerpApi Google Scholar API de tim ket qua phu hop.
- Kiem tra do khop giua title dau vao va title tra ve tu Google Scholar.
- Goi SerpApi Google Scholar Cite API de lay link BibTeX.
- Hien thi ket qua tren giao dien va cho tai file Excel ket qua.
- Co san file Excel mau trong project.

## Yeu cau

- Node.js 18 tro len.
- npm.
- SerpApi API key.

Kiem tra nhanh:

```powershell
node --version
npm.cmd --version
```

## Cai dat

Tai thu muc project:

```powershell
cd d:\toy_proj
npm.cmd install
```

## Cau hinh API key

Co 2 cach su dung SerpApi API key.

Cach 1: nhap truc tiep tren giao dien app.

Cach 2: tao file `.env` tu file mau:

```powershell
Copy-Item .env.example .env
```

Sau do mo `.env` va dien:

```text
SERPAPI_API_KEY=your_serpapi_key_here
PORT=3000
BIBTEX_DOWNLOAD_DELAY_MS=2500
BIBTEX_RETRY_ATTEMPTS=4
BIBTEX_RETRY_BASE_DELAY_MS=5000
```

Neu da dat `SERPAPI_API_KEY` trong `.env`, o API key tren giao dien co the de trong.

## Tao file Excel mau

Project co script tao file mau:

```powershell
npm.cmd run create-sample
```

File mau se nam tai:

```text
samples/sample-papers.xlsx
```

## Chay ung dung

```powershell
npm.cmd start
```

Mo trinh duyet tai:

```text
http://localhost:3000
```

## Dinh dang Excel dau vao

App doc sheet dau tien trong file Excel.

Cot nen dung:

```text
title
```

Cac ten cot khac duoc ho tro:

```text
paper_title
article_title
ten_bai_bao
publication_title
```

Vi du:

| title |
| --- |
| Attention Is All You Need |
| BERT: Pre-training of Deep Bidirectional Transformers for Language Understanding |
| Deep Residual Learning for Image Recognition |

## Ket qua dau ra

File ket qua tai ve co cac cot:

- `index`: so thu tu dong.
- `input_title`: ten bai bao trong Excel dau vao.
- `status`: `ok` hoac `warning`.
- `warning`: ly do canh bao neu co.
- `matched_title`: title app tim thay tren Google Scholar.
- `match_score`: diem do khop title.
- `result_id`: Google Scholar result id dung cho Cite API.
- `result_link`: link ket qua Scholar.
- `bibtex`: noi dung BibTeX lay duoc.

## Cach app lay BibTeX

Voi moi title:

1. Goi SerpApi voi `engine=google_scholar`.
2. Chon ket qua co title khop nhat.
3. Neu diem khop thap hon nguong an toan, tra ve `warning`.
4. Neu khop, lay `result_id`.
5. Goi SerpApi voi `engine=google_scholar_cite`.
6. Lay link `BibTeX` va tai noi dung BibTeX.

## Loi thuong gap

`Missing SerpApi API key.`

Ban chua nhap API key tren giao dien va cung chua dat `SERPAPI_API_KEY` trong `.env`.

`Invalid API key.`

SerpApi API key khong dung hoac chua duoc kich hoat.

`No paper titles found.`

File Excel khong co cot title hop le. Hay dung cot `title` de don gian nhat.

`Title does not match the Scholar result closely enough.`

Google Scholar co ket qua gan dung nhung app khong xem la du khop. Dong nay se co `warning` va khong lay BibTeX.

`BibTeX download was rate-limited by Google Scholar (HTTP 429).`

SerpApi da tim duoc ket qua va link BibTeX, nhung buoc tai noi dung BibTeX tu Google Scholar bi rate-limit. Hay cho vai phut roi chay lai. Neu danh sach co nhieu bai, tang delay trong `.env`:

```text
BIBTEX_DOWNLOAD_DELAY_MS=6000
BIBTEX_RETRY_ATTEMPTS=5
BIBTEX_RETRY_BASE_DELAY_MS=8000
```

## Scripts

```powershell
npm.cmd start
```

Chay server localhost.

```powershell
npm.cmd run dev
```

Chay server o che do watch.

```powershell
npm.cmd run create-sample
```

Tao lai file Excel mau.
