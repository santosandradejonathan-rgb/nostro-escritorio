# Vanessa · Comercial IA da Nostro

Janela de voz da Vanessa, a SDR de IA da Nostro Agência. Abra no Chrome, clique no microfone e converse.

- `index.html`: a janela (rosto da Vanessa, ferramentas ao redor, conversa só por voz).
- `vozes.html`: escolha e teste da voz da Vanessa.
- `supabase/functions/agente`: o cérebro (Claude), com o manual de vendas e as ferramentas do Hub.
- `supabase/functions/ferramentas`: busca de leads, análise de site, CNPJ e funil do Comercial IA no Nostro Hub.
- `supabase/functions/voz`: voz neural da Microsoft (Azure).

A memória das conversas fica na tabela `escritorio_memoria` do Supabase.
