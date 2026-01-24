import { createClient } from '@supabase/supabase-js'

// 1. Vai su Supabase -> Project Settings -> API
// 2. Copia "Project URL" e incollalo qui sotto tra gli apici
const supabaseUrl = 'https://exrckfdqtyrvndywmnpp.supabase.co'

// 3. Copia "anon / public" Key e incollala qui sotto tra gli apici
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImV4cmNrZmRxdHlydm5keXdtbnBwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjkxNjEzMzEsImV4cCI6MjA4NDczNzMzMX0.5WaMDBL6FzSuU_cCAclM7s9n3OF9_lW63hfnLDkQeaM'

export const supabase = createClient(supabaseUrl, supabaseKey)