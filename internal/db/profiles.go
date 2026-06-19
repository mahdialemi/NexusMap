package db

func (d *DB) GetProfiles() ([]Profile, error) {
	rows, err := d.Query("SELECT id, name, description, command, category, sort_order, is_builtin, created_at FROM profiles ORDER BY category, sort_order")
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var profiles []Profile
	for rows.Next() {
		var p Profile
		if err := rows.Scan(&p.ID, &p.Name, &p.Description, &p.Command, &p.Category, &p.SortOrder, &p.IsBuiltin, &p.CreatedAt); err != nil {
			return nil, err
		}
		profiles = append(profiles, p)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return profiles, nil
}

func (d *DB) GetProfileCategories() ([]string, error) {
	rows, err := d.Query("SELECT DISTINCT category FROM profiles ORDER BY category")
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var categories []string
	for rows.Next() {
		var cat string
		if err := rows.Scan(&cat); err != nil {
			return nil, err
		}
		categories = append(categories, cat)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return categories, nil
}

func (d *DB) CreateProfile(name, description, command, category string) error {
	var maxOrder int
	err := d.QueryRow("SELECT COALESCE(MAX(sort_order), 0) FROM profiles WHERE category = ?", category).Scan(&maxOrder)
	if err != nil {
		return err
	}
	_, err = d.Exec("INSERT INTO profiles (name, description, command, category, sort_order, is_builtin) VALUES (?, ?, ?, ?, ?, 0)",
		name, description, command, category, maxOrder+1)
	return err
}

func (d *DB) UpdateProfile(id int, name, description, command, category string) error {
	_, err := d.Exec("UPDATE profiles SET name = ?, description = ?, command = ?, category = ? WHERE id = ?",
		name, description, command, category, id)
	return err
}

func (d *DB) DeleteProfile(id int) error {
	_, err := d.Exec("DELETE FROM profiles WHERE id = ? AND is_builtin = 0", id)
	return err
}
