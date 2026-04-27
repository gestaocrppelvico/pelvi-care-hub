# Vincular usuários Fisio aos registros profissionais

## Objetivo
Permitir, na tela "Mais", que o Admin ligue cada usuária com papel **Fisio** ao registro pré-cadastrado em `profissionais` (Wilianne, Elizabeth, Bruna, Juliana). Sem essa ligação, as fisios não enxergam os próprios pacientes/agendas — pois a regra de segurança usa `profissionais.user_id` para identificar quem é "dona" do dado.

## O que muda na interface

Na tela **Mais**, em cada card de usuário que já tem o papel **Fisio**, aparece uma nova seção:

- **Se já está vinculado:** mostra o nome do profissional + bolinha colorida (cor da agenda) + botão para desvincular.
- **Se não está vinculado:** dropdown listando apenas os registros profissionais ainda livres (com a cor de cada um) + botão "Vincular".

Cada usuária Fisio só pode estar ligada a **um** registro profissional, e cada registro profissional só pode pertencer a **uma** usuária.

## Fluxo recomendado depois de aprovado

1. Cada fisio cria a conta em `/auth`
2. Você atribui o papel **Fisio** (já funciona)
3. Aparece o seletor → escolhe o nome dela na lista (Wilianne / Elizabeth / Bruna / Juliana) → "Vincular"
4. A partir desse momento, ela enxerga sua agenda e seus pacientes ao logar

## Detalhes técnicos

- Arquivo afetado: `src/pages/Mais.tsx`
- Carrega `profissionais` (id, nome, cor_agenda, user_id) junto com os usuários
- `vincularProfissional(userId, profId)`:
  - Limpa qualquer vínculo anterior do mesmo usuário ou do mesmo profissional (`UPDATE ... SET user_id = NULL`)
  - Define `user_id` no registro escolhido
- `desvincularProfissional(profId)`: zera `user_id`
- Operações usam a policy existente `admin manage profissionais` (somente Admin)
- Não requer mudanças de schema nem de RLS

## Fora de escopo desta etapa
- Criar novos registros em `profissionais` pela UI (se aparecer alguma fisio nova futura, fazemos depois)
- Editar cor / valor de repasse pela UI (próxima fase: Financeiro)
